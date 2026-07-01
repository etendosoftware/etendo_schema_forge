import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:gLJournal
const fields = [
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE((SELECT ENDDATE FROM C_PERIOD WHERE C_PERIOD_ID = @C_PERIOD_ID@ and periodtype = \'A\'),to_date(@HeaderDateAcct@)) FROM DUAL', readOnlyLogic: (record) => record['posted'] === true },
  { key: 'period', column: 'C_Period_ID', type: 'search', label: 'Period', required: true, section: 'principal', reference: 'Period', inputMode: 'search', defaultValue: '@SQL= SELECT C_Period_ID FROM C_Period WHERE C_Year_ID IN (SELECT C_Year_ID FROM C_Year WHERE C_Calendar_ID =(SELECT C_Calendar_ID FROM AD_ORG WHERE AD_Client_ID= @AD_Client_ID@ AND AD_ORG_ID=(SELECT AD_ORG_GETCALENDAROWNER( @AD_Org_ID@ ) from dual))) AND to_date( COALESCE(@DateAcct@,@#Date@) ) BETWEEN StartDate AND EndDate AND PeriodType=\'S\' AND exists (select 1 from c_periodcontrol where c_periodcontrol.c_period_id = c_period.c_period_id AND periodstatus = \'O\')', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', required: true, section: 'principal', defaultValue: '@DESCRIPTION0@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'opening', column: 'IsOpening', type: 'checkbox', label: 'Opening', required: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'multigeneralLedger', column: 'Multi_Gl', type: 'checkbox', label: 'Multi-General Ledger', required: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:gLJournal

// @sf-generated-start component:GLJournalForm
export default function GLJournalForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:GLJournalForm
