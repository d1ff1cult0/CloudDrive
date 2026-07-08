import { redirect } from "next/navigation";

// Root simply forwards to the dashboard; middleware handles the auth gate.
export default function Home() {
  redirect("/dashboard");
}
