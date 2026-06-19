import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { fetchCandidates } from "@/app/lib/data";
import { CandidateList } from "@/components/organisms/CandidateList";

export default async function CandidateSelectionPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    // @ts-ignore
    const userRole = session.user.role;
    // @ts-ignore
    const partyId = session.user.partyId;
    // @ts-ignore
    const slateId = session.user.slateId;

    // SECURITY: Candidates cannot access this list
    if (userRole === 'CANDIDATO') {
        redirect('/');
    }

    const candidates = await fetchCandidates(userRole, partyId, slateId);

    return (
        <div>
            {/* Header moved to CandidateList component */}

            <CandidateList candidates={candidates} />
        </div>
    );
}
