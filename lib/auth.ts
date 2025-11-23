import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

/**
 * Vérifie si l'utilisateur connecté est un admin
 * @returns La session si l'utilisateur est admin, null sinon
 */
export async function checkAdminAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return null;
  }
  
  if (session.user.role !== "admin") {
    return null;
  }
  
  return session;
}
