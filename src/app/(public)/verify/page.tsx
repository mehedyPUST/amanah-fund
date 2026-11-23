import type { Metadata } from 'next';
import { AgreementVerificationCard } from '../../../components/AgreementVerificationCard.tsx';
import { getPublicFundHeading } from '../../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify Digital Membership Agreement — Amanah',
  description:
    'Look up and verify an Amanah Cooperative Digital Membership Agreement by Agreement ID or Member ID.',
};

export default async function VerifyIndexPage() {
  const projectHeading = await getPublicFundHeading();

  return <AgreementVerificationCard verification={null} projectHeading={projectHeading} />;
}
