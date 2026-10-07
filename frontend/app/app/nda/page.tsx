import type { Metadata } from "next";
import NdaCreator from "@/components/NdaCreator";
import { loadNdaTemplate } from "@/lib/nda-template";

export const metadata: Metadata = {
  title: "Mutual NDA Creator",
  description:
    "Chat with an AI assistant to draft a Common Paper Mutual Non-Disclosure Agreement and download it as a PDF.",
};

export default async function NdaPage() {
  const template = await loadNdaTemplate();
  return <NdaCreator template={template} />;
}
