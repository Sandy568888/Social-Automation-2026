export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Revozi Automation',
  description: '',
};
import { AutomationComponent } from '@gitroom/frontend/components/automation/automation.component';
export default async function Index() {
  return <AutomationComponent />;
}
