import type { Metadata } from "next";

import TeamPage from "../team/page";

export const metadata: Metadata = { title: "People & Access" };
export const dynamic = "force-dynamic";

type PeoplePageProps = {
  searchParams: Promise<{
    created?: string;
    token?: string;
    updated?: string;
    revoked?: string;
    error?: string;
    delivery?: string;
    prepared?: string;
    embedded?: string;
  }>;
};

export default function PeoplePage(props: PeoplePageProps) {
  return <TeamPage {...props} />;
}
