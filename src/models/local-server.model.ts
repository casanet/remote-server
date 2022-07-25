import { Column, Entity, PrimaryColumn, ValueTransformer } from 'typeorm';

export const bigint: ValueTransformer = {
  to: (entityValue: number) => entityValue.toString(),
  from: (databaseValue: string): number => parseInt(databaseValue, 10)
};

/**
 * Represents a local server in the system.
 */
@Entity({ name: 'servers' })
export class LocalServer {
  /** The local machine mac address should be unique. */
  @PrimaryColumn({ name: 'physical_address', type: 'varchar', length: 12, nullable: false })
  public macAddress: string;

  /** Display name */
  @Column({ name: 'display_name', type: 'varchar', length: 30, nullable: true })
  public displayName: string;

  /** Contact mail, allow null case there is no contact defined */
  @Column({ name: 'contact_mail', type: 'varchar', length: 150, nullable: true })
  public contactMail?: string;

  /** The platform OS of the local sever (data received on init) */
  @Column({ name: 'platform', type: 'varchar', length: 50, nullable: true })
  public platform?: string;

  /** The local server version */
  @Column({ name: 'version', type: 'varchar', length: 100, nullable: true })
  public version?: string;

  /** Users from the local server that can access via remote server. */
  @Column({ name: 'valid_users', type: 'varchar', array: true, nullable: false })
  public validUsers: string[];

  /** Free text comment */
  @Column({ name: 'comment', type: 'varchar', length: 1000, nullable: true })
  public comment?: string;

  /** Server last connection timestamp */
  @Column({ name: 'last_connection', type: 'bigint', nullable: true, transformer: [bigint] })
  public lastConnection?: number;

  /** Server last disconnection timestamp */
  @Column({ name: 'last_disconnection', type: 'bigint', nullable: true, transformer: [bigint] })
  public lastDisconnection?: number;

  constructor(private localServer?: Partial<LocalServer>) {
    if (localServer) {
      Object.assign(this, localServer);
    }
  }
}
