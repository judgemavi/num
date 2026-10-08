import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/request";

const idSchema = {
  parse(data: unknown): { id: string } {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string" || data.id.length === 0) {
      throw new Error("The restored record has no id");
    }
    return { id: data.id };
  },
};

export function useRestoreNamed() {
  const queryClient = useQueryClient();
  return async (path: string) => {
    const result = await apiRequest(path, idSchema, { method: "POST" });
    if (!result.ok) {
      return null;
    }
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["merchants"] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
    return result.data.id;
  };
}
