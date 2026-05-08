import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function useIsCustomer(): boolean {
  const { data } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000, retry: false },
  });
  return (data as { role?: string } | undefined)?.role === "customer";
}
