import * as nodemailer from 'nodemailer';
import { SendMailOptions, SentMessageInfo } from 'nodemailer';

import { Configuration } from './config';

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: Configuration.twoStepsVerification.smtpServer,
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: Configuration.twoStepsVerification.userName,
    pass: Configuration.twoStepsVerification.userKey,
  },
});

/**
 * Send 2-steps verification code to email.
 * @param to mail account to sent mail to.
 * @param code generate code to send.
 */
export const SendMail = async (to: string, code: string) => {
  const mailOptions: SendMailOptions = {
    from: '"casanet" <' + Configuration.twoStepsVerification.userName + '>',
    to,
    replyTo: undefined,
    inReplyTo: undefined,
    subject: 'Casanet Account Verification',
    html: `
        <!DOCTYPE html>
        <body>
            <table style="width:420px;text-align:center;margin:0 auto;padding:30px 0;line-height:1.5;">
                <tbody>
                    <tr>
                        <td>
                            <table style="width:100%;margin-top:46px;background:#fff;
                                          box-shadow:0px 0px 15px rgb(138, 135, 135);text-align:center;">
                                <tbody>
                                    <tr>
                                        <td style="font-size:20px;font-weight:400;padding-top:120px;color:#303030;">
                                            Casanet Verification Code
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-size:36px;font-weight:800;color: rgb(6, 99, 75);">${code}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size:16px;font-weight:200;padding-top:30px;color: #303030;">
                                            This code is used to validate your account:
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-size:16px;font-weight:400;color: #303030;
                                                   padding-bottom:108px;border-bottom:1px solid #eee;">
                                             ${to}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-size:13px;font-weight:200;color: #9b9b9b;padding-top:20px;">
                                            The generated code will expire within 5 minutes
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>
        </body>`,
  };

  // send mail with defined transport object
  return transporter.sendMail(mailOptions);
};

export const SendStatusNotificationMail = async (to: string, localServerName: string, status: boolean) => {
  const timestump = `
    <div style="font-size:30px;font-weight:700;color: rgb(51, 0, 26);">
        At ${new Date().toLocaleString(process.env.NOTIFICATIONS_TIME_FORMAT || 'he-IL', {
          timeZone: process.env.NOTIFICATIONS_TIMEZON || 'Asia/Jerusalem',
        })}
    </div>`;

  const alert = `
    <td style="font-size:36px;font-weight:800;color: rgb(204, 51, 0);">
        Notice! your local server  '${localServerName}' disconnected from the remote server.
        <br>
        <br>
            ${timestump}
        <br>
        <br>
        <div style="text-align:left;font-size:20px;font-weight:600;color: rgb(6, 99, 75);">
            If you don't know why, try the following steps:
            <ul>
                <li>
                    Check the local server computer health.
                </li>
                <li>
                    Try enter to the local server dashboard via local network address.    
                </li>
                <li>
                    In the dashboard check the remote server status & URL.
                </li>
                <li>
                    Check your home internet connection.
                </li>
            </ul>
        </div>
    </td>`;

  const notification = `
    <td style="font-size:36px;font-weight:800;color: rgb(6, 99, 75);">
        Your local server  '${localServerName}' successfully connected to the remote server.

        <br>
        <br>
        ${timestump}
    </td>`;

  const mailOptions: SendMailOptions = {
    from: '"casanet remote" <' + Configuration.twoStepsVerification.userName + '>',
    to,
    replyTo: undefined,
    inReplyTo: undefined,
    subject: `Casanet Remote ${status ? 'Notification' : 'Alert'}`,
    html: `
        <!DOCTYPE html>
        <body>
            <table style="width:420px;text-align:center;margin:0 auto;padding:30px 0;line-height:1.5;">
                <tbody>
                    <tr>
                        <td>
                            <table style="width:100%;margin-top:46px;background:#fff;
                                          box-shadow:0px 0px 15px rgb(138, 135, 135);text-align:center;">
                                <tbody>
                                    <tr>
                                        <td style="font-size:20px;font-weight:400;padding-top:120px;color:#303030;">
                                            Casanet Remote ${status ? 'Notification' : 'Alert'}
                                        </td>
                                    </tr>
                                    <tr>
                                        ${status ? notification : alert}
                                    </tr>
                                    <tr>
                                        <td style="font-size:13px;font-weight:200;color: #9b9b9b;padding-top:20px;">
                                            This email sent to you from the casanet remote server because your email is a contact of a local server. if not please contact us by reply to this message.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>
        </body>`,
  };

  // send mail with defined transport object
  return transporter.sendMail(mailOptions);
};
