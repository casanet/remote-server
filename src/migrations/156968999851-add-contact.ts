import { MigrationInterface, QueryRunner, TableColumn  } from 'typeorm';

                         
export class AddContact1569689998510 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await this._createColumns(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn('servers', 'contact_mail');
  }

  private async _createColumns(queryRunner: QueryRunner) {
    await queryRunner.addColumn(
      'servers',
      new TableColumn({
        name: 'contact_mail',
        type: 'varchar',
        isNullable: true,
        length: '150',
      })
    );
  }
}
