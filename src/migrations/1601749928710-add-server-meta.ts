import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddServerMeta1601749928710 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await this._createColumns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn('servers', 'platform');
    await queryRunner.dropColumn('servers', 'version');
  }

  private async _createColumns(queryRunner: QueryRunner) {
    await queryRunner.addColumns('servers', [
      new TableColumn({
        name: 'platform',
        type: 'varchar',
        isNullable: true,
        length: '50',
      }),
      new TableColumn({
        name: 'version',
        type: 'varchar',
        isNullable: true,
        length: '100',
      }),
    ]);
  }
}
