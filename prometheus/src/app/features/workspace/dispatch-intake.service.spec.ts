import { DispatchIntakeService } from './dispatch-intake.service';

describe('DispatchIntakeService', () => {
  const service = new DispatchIntakeService();

  it('parses broker load shorthand without treating command words as the origin city', () => {
    const result = service.parse('broker', 'post load Chicago,Il to jacksonville,FL V53');

    expect(result.error).toBeNull();
    expect(result.draft?.origin).toEqual({ city: 'Chicago', state: 'IL' });
    expect(result.draft?.destination).toEqual({ city: 'Jacksonville', state: 'FL' });
    expect(result.draft?.equipmentCodes).toEqual(['V']);
    expect(result.draft?.length).toBe(53);
  });

  it('turns pasted list rows into dispatch drafts and reports rows that need help', () => {
    const result = service.parseBatch(
      'broker',
      [
        'Origin | Destination | Equipment | Weight | Rate',
        'Chicago, IL to Jacksonville, FL V53 42000 lbs $2500',
        'Memphis, TN to Houston, TX reefer 41000 lbs $2200',
        'Need one more tomorrow but I forgot the cities',
      ].join('\n')
    );

    expect(result.drafts.length).toBe(2);
    expect(result.drafts[0].origin).toEqual({ city: 'Chicago', state: 'IL' });
    expect(result.drafts[0].destination).toEqual({ city: 'Jacksonville', state: 'FL' });
    expect(result.drafts[1].origin).toEqual({ city: 'Memphis', state: 'TN' });
    expect(result.drafts[1].destination).toEqual({ city: 'Houston', state: 'TX' });
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].line).toContain('forgot the cities');
  });
});
