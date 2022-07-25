import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddConnectionState1658784799261 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await this._createColumns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn('servers', 'last_connection');
    await queryRunner.dropColumn('servers', 'last_disconnection');
  }

  private async _createColumns(queryRunner: QueryRunner) {
    await queryRunner.addColumns('servers', [
      new TableColumn({
        name: 'last_connection',
        type: 'bigint',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_disconnection',
        type: 'bigint',
        isNullable: true,
      }),
    ]);
  }
}
