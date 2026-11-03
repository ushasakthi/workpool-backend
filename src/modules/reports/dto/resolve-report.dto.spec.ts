import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolveReportDto } from './resolve-report.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(ResolveReportDto, body));
  return errors.map((e) => e.property);
}

describe('ResolveReportDto severity', () => {
  it('accepts an upheld report with a severity', async () => {
    expect(await errorsFor({ status: 'reviewed', severity: 'high' })).toEqual(
      [],
    );
  });

  it('refuses an upheld report without a severity', async () => {
    expect(await errorsFor({ status: 'reviewed' })).toEqual(['severity']);
  });

  it('refuses a severity that is not low, medium or high', async () => {
    expect(
      await errorsFor({ status: 'reviewed', severity: 'extreme' }),
    ).toEqual(['severity']);
  });

  it('does not need a severity to dismiss', async () => {
    expect(await errorsFor({ status: 'dismissed' })).toEqual([]);
  });
});
