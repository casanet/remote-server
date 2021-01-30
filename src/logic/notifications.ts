import * as moment from 'moment';
import { getServer } from '../data-access';
import { logger } from '../logger';
import { SendStatusNotificationMail } from '../mailSender';
import { Channels, ChannelsSingleton } from './channels';

declare interface ServerNotifyTask {
  status: boolean;
  notificationTask: NodeJS.Timeout;
  isPending: boolean;
}

/**
 * Handle system notifications and alerts.
 */
export class Notifications {
  private NOTIFICATION_TIME_WINDOW: moment.Duration = moment.duration(+process.env.NOTIFICATION_CONNECTION_EVENT_MINUTES_WINDOW || 2, 'minutes');

  private notificationTasks: { [key: string]: ServerNotifyTask } = {};

  constructor(private channels: Channels) {
    this.channels.localServersStatusFeed.subscribe(serverStatus => {
      if (!serverStatus) {
        return;
      }

      try {
        this.handleServerConnectionStatusChanged(serverStatus);
      } catch (error) { }
    });
  }

  private async handleServerConnectionStatusChanged(serverStatus: { localServerId: string; theNewStatus: boolean }) {
    /**
     * Get the last server status and task,
     */
    const lastNotificationTask: ServerNotifyTask = this.notificationTasks[serverStatus.localServerId];

    /* if this is the first notification create a new task notification struct, and abort notificate */
    if (!lastNotificationTask) {
      this.notificationTasks[serverStatus.localServerId] = {
        isPending: false,
        notificationTask: null,
        status: serverStatus.theNewStatus,
      };
      return;
    }

    /** If status same as the last notification, ignore sending another notification */
    if (lastNotificationTask.status === serverStatus.theNewStatus) {
      return;
    }

    /** Get the local server */
    const server = await getServer(serverStatus.localServerId);

    /** If there is no contact, abort. */
    if (!server.contactMail) {
      return;
    }

    /**
     * If the status changed back to original status in the notification time window,
     * cancel the notification task.
     */
    if (lastNotificationTask.isPending && lastNotificationTask.status !== serverStatus.theNewStatus) {
      lastNotificationTask.isPending = false;
      lastNotificationTask.status = serverStatus.theNewStatus;
      clearTimeout(lastNotificationTask.notificationTask);
      return;
    }

    /**
     * Hold the notification in a time window before sending,
     * case the status return to his original status
     */
    const timeoutTaskRef = setTimeout(async () => {
      /** Send notification to the contact about the new status */
      try {
        await SendStatusNotificationMail(server.contactMail, server.displayName, serverStatus.theNewStatus);
        logger.info(
          `A notification mail with meesage about the new status ('${serverStatus.theNewStatus}') of ${server.displayName} local server successfully sent`,
        );
      } catch (error) {
        logger.error(`Sending mail notification failed, API problem, ${error.message}`);
      }
      lastNotificationTask.isPending = false;
    }, this.NOTIFICATION_TIME_WINDOW.asMilliseconds());

    /** Update task props */
    lastNotificationTask.isPending = true;
    lastNotificationTask.status = serverStatus.theNewStatus;
    lastNotificationTask.notificationTask = timeoutTaskRef;
  }
}

export const NotificationsSingleton = new Notifications(ChannelsSingleton);
