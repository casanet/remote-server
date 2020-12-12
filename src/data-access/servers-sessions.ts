import * as cryptoJs from 'crypto-js';
import { getConnection } from 'typeorm';
import { Configuration } from '../config';

import { LocalServer, ServerCertificates, ServerSession } from '../models';
import { getServer } from './local-servers';

export async function verifyAndGetLocalServer(serverCertificates: ServerCertificates): Promise<LocalServer> {
  const localServer = await getServer(serverCertificates.mac);

  await checkSession(
    localServer,
    cryptoJs.SHA512(serverCertificates.key + Configuration.keysHandling.saltHash).toString(),
  );

  return localServer;
}

export const checkSession = async (server: LocalServer, hashedKey: string): Promise<ServerSession> => {
  const serversSessionsRepository = getConnection().getRepository(ServerSession);
  return await serversSessionsRepository.findOneOrFail({
    where: {
      server,
      hashedKey,
    },
  });
};

export const setServerSession = async (serverSession: ServerSession): Promise<void> => {
  const serversSessionsRepository = getConnection().getRepository(ServerSession);
  await serversSessionsRepository.save(serverSession);
};

export const deleteServerSession = async (serverSession: ServerSession): Promise<void> => {
  const serversSessionsRepository = getConnection().getRepository(ServerSession);
  await serversSessionsRepository.delete(serverSession);
};
