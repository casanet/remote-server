import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { LocalServer } from '.';
/**
 * Represents a local server in the system.
 */
@Entity({ name: 'servers_sessions' })
export class ServerSession {
    @PrimaryColumn()
    @OneToOne((type) => LocalServer)
    @JoinColumn({ name: 'server'})
    public server: LocalServer;

    @Column({ name: 'hashed_key', type: 'varchar', length: 256, nullable: false })
    public hashedKey: string;
}
