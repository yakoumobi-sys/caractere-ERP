import { requireMe } from "@/lib/auth";
import { q } from "@/lib/erp";
import { Card, PageHeader, Table, Td, inputCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CashTabs } from "@/components/cash-nav";
import { cashCorrection } from "@/app/actions/cash";
import { dzd, fdate } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function Sessions() {
  const me = await requireMe("cash");
  const rows = await q(me, "select * from erp.v_cash_sessions order by opened_at desc limit 60");
  return (
    <div><PageHeader title="Caisse" subtitle="Clôtures : espèces attendues, comptées, écart et corrections du gérant" /><CashTabs current="sessions" />
      <Card><Table head={["Ouverture", "Clôture", "Attendu", "Compté", "Écart", "Corrections", "Écart final", ...(me.can("cash_correct") ? ["Correction"] : [])]}>
        {rows.map((s: any) => {
          const final = s.closed_at ? Number(s.counted_cash) - (Number(s.expected_cash) + Number(s.corrections)) : null;
          return (
            <tr key={s.id}><Td className="text-xs">{fdate(s.opened_at, true)}<div>{s.opened_by_name}</div></Td><Td className="text-xs">{s.closed_at ? <>{fdate(s.closed_at, true)}<div>{s.closed_by_name}</div></> : "ouverte"}</Td>
              <Td>{dzd(s.closed_at ? s.expected_cash : s.current_expected)}</Td><Td>{dzd(s.counted_cash)}</Td><Td className={Number(s.gap) ? "text-red-700" : ""}>{dzd(s.gap)}{s.close_note && <div className="text-xs text-slate-500">{s.close_note}</div>}</Td>
              <Td>{dzd(s.corrections)}</Td><Td className={final ? "font-semibold text-red-700" : "text-emerald-700"}>{final === null ? "—" : dzd(final)}</Td>
              {me.can("cash_correct") && <Td><ActionForm action={cashCorrection} className="flex gap-1"><input type="hidden" name="session_id" value={s.id} /><input name="amount" required inputMode="decimal" placeholder="±DA" className={inputCls + " w-20"} /><input name="label" required placeholder="Justification" className={inputCls} /><SubmitButton variant="secondary">OK</SubmitButton></ActionForm></Td>}
            </tr>
          );
        })}
      </Table></Card></div>
  );
}
