import type { Metadata } from 'next';
import { AgreementVerificationCard } from '../../../components/AgreementVerificationCard.tsx';
import { getPublicAgreementVerification } from '../../../server/ssrData.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify Digital Membership Agreement — Amanah',
  description:
    'Verify cooperative membership credentials, joining date, approval date, and active status.',
};

export default async function VerifyAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decodedToken = (() => {
    try {
      return decodeURIComponent(token);
    } catch {
      return token;
    }
  })();
  const { verification, projectHeading } = await getPublicAgreementVerification(decodedToken);

  return (
    <AgreementVerificationCard
      verification={verification}
      projectHeading={projectHeading}
      searchedToken={decodedToken}
    />
  );
}
