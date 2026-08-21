import { EntityFormPage } from "@/components/entity/entity-form-page";
import { EmployeeKpis } from "@/components/hr/employee-kpis";
import { EmployeeFaults } from "@/components/hr/employee-faults";
import { employeesConfig } from "@/lib/entities";

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      <EntityFormPage config={employeesConfig} id={params.id} />
      <div className="max-w-2xl">
        <EmployeeKpis employeeId={params.id} />
        <EmployeeFaults employeeId={params.id} />
      </div>
    </div>
  );
}
