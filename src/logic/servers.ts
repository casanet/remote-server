import { Channels, ChannelsSingleton } from './channels';
import { getServer } from '../data-access';
import { SendStatusNotificationMail } from '../mailSender';
import { logger } from '../logger';
import * as moment from 'moment';

/**
 * Cache utility. wrap cache API to replace cache tool with redis client easily.
 */
export class LocalServers {

    private NOTIFICATION_TIME_WINDOW: moment.Duration = moment.duration(2, 'minutes');

    private notificationTasks: { [key: string]: { status: boolean, notificationTask: NodeJS.Timeout, } } = {};

    constructor(private ChannelsSingleton: Channels) {
        this.ChannelsSingleton.localServersStautsFeed.subscribe((serverStatus) => {
            if (!serverStatus) {
                return;
            }

            try { this.handleServerConnectionStatusChanged(serverStatus); } catch (error) { }
        });
    }

    private async handleServerConnectionStatusChanged(serverStatus: { localServerId: string, theNewStatus: boolean }) {

        const lastNotificationTask = this.notificationTasks[serverStatus.localServerId];

        /** If status same as the last notification, ignore sending another notification */
        if (lastNotificationTask && lastNotificationTask.status === serverStatus.theNewStatus) {
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
        if (lastNotificationTask && lastNotificationTask.status !== serverStatus.theNewStatus) {
            this.notificationTasks[serverStatus.localServerId] = null;
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
                await SendStatusNotificationMail(server.contactMail, server.displayName, serverStatus.theNewStatus)
                logger.info(`Email status '${serverStatus.theNewStatus}' notification of ${server.displayName} successfully sent`);
            } catch (error) {
                logger.error(`Sending mail notification failed, API problem, ${error.message}`);
            }
            this.notificationTasks[serverStatus.localServerId] = null;
        }, this.NOTIFICATION_TIME_WINDOW.asMilliseconds());

        this.notificationTasks[serverStatus.localServerId] = {
            notificationTask :timeoutTaskRef,
            status :  serverStatus.theNewStatus,
        }

    }

}

export const LocalServersSingleton = new LocalServers(ChannelsSingleton);
