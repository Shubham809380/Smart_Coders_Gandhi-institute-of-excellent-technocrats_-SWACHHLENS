import { authService } from "../services.js";

export function useUserRole() {
  return authService.getCurrentRole();
}
