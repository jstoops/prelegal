import NdaCreator from "@/components/NdaCreator";
import { loadNdaTemplate } from "@/lib/nda-template";

export default async function Home() {
  const template = await loadNdaTemplate();
  return <NdaCreator template={template} />;
}
