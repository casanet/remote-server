import { Channels, ChannelsSingleton } from './channels';
import { getServer } from '../data-access';
import { SendStatusNotificationMail } from '../mailSender';
import { logger } from '../logger';
/**
 * Cache utility. wrap cache API to replace cache tool with redis client easily.
 */
export class LocalServers {

    constructor(private ChannelsSingleton: Channels) {
        this.ChannelsSingleton.localServersStautsFeed.subscribe((serverStatus) => {
            if (!serverStatus) {
                return;
            }

            try { this.handleServerConnectionStatusChanged(serverStatus); } catch (error) { }
        });
    }

    private async handleServerConnectionStatusChanged(serverStatus: { localServerId: string, theNewStatus: boolean }) {
        
        /** Get the local server */
        const server = await getServer(serverStatus.localServerId);

        /** If there is no contact, abort. */
        if(!server.contactMail){
            return;
        }

        /** Send notification to the contact about the new status */
        try {
            await SendStatusNotificationMail(server.contactMail, server.displayName, serverStatus.theNewStatus)            
            logger.info(`Email status '${serverStatus.theNewStatus}' notification of ${server.displayName} successfully sent`);
        } catch (error) {
            logger.error(`Sending mail notification failed, API problem, ${error.message}`);
        }
    }

}

export const LocalServersSingleton = new LocalServers(ChannelsSingleton);
