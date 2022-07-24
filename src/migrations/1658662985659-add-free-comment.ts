import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFreeComment1658662985659 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await this._createColumns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn('servers', 'comment');
  }

  private async _createColumns(queryRunner: QueryRunner) {
    await queryRunner.addColumn(
      'servers',
      new TableColumn({
        name: 'comment',
        type: 'varchar',
        isNullable: true,
        length: '1000',
      }),
    );
  }
}
