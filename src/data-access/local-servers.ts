import { Any, getConnection } from 'typeorm';

import { LocalServer } from '../models';

export const getServers = async (): Promise<LocalServer[]> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  return await serversRepository.find();
};

export const getServer = async (macAddress: string): Promise<LocalServer> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  return await serversRepository.findOne({
    where: {
      macAddress,
    },
  });
};

export const getServersByForwardUser = async (user: string): Promise<LocalServer[]> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  return await serversRepository
    .createQueryBuilder('server')
    .where(':user =ANY(server.valid_users)', { user })
    .getMany();
};

export const updateServer = async (server: LocalServer): Promise<void> => {
  const { displayName, validUsers, macAddress, contactMail, comment } = server;
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.update(macAddress, {
    displayName,
    validUsers,
    contactMail,
    comment,
  });
};

export const updateServerMeta = async (macAddress: string, platform: string, version: string, localIp?: string): Promise<void> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.update(macAddress, {
    platform,
    version,
    localIp,
  });
};

export const updateServerConnection = async (macAddress: string): Promise<void> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.update(macAddress, {
    lastConnection: new Date().getTime()
  });
};

export const updateServerDisconnection = async (macAddress: string): Promise<void> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.update(macAddress, {
    lastDisconnection: new Date().getTime()
  });
};

export const createServer = async (server: LocalServer): Promise<void> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.insert(new LocalServer(server));
};

export const deleteServer = async (macAddress: string): Promise<void> => {
  const serversRepository = getConnection().getRepository(LocalServer);
  await serversRepository.delete(macAddress);
};
