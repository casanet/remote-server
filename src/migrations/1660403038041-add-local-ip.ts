import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLocalIp1660403038041 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await this._createColumns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn('servers', 'local_ip');
  }

  private async _createColumns(queryRunner: QueryRunner) {
    await queryRunner.addColumns('servers', [
      new TableColumn({
        name: 'local_ip',
        type: 'varchar',
        isNullable: true,
        length: '256',
      }),
    ]);
  }
}
