import { bucketListSchema, type Bucket, type BucketColor, type BucketListQuery } from "@num/shared";
import { apiRequest } from "@/request";

export async function loadBuckets(search: Pick<BucketListQuery, "archived" | "sort" | "dir">): Promise<{
  items: Bucket[];
  total: number;
  nextColor: BucketColor;
}> {
  const items: Bucket[] = [];
  let page = 1;
  let total = 0;
  let nextColor: BucketColor = "sky";
  for (;;) {
    const params = new URLSearchParams();
    params.set("pageSize", "200");
    if (page !== 1) {
      params.set("page", String(page));
    }
    if (search.archived) {
      params.set("archived", "true");
    }
    if (search.sort) {
      params.set("sort", search.sort);
    }
    if (search.dir) {
      params.set("dir", search.dir);
    }
    const result = await apiRequest(`/api/buckets?${params.toString()}`, bucketListSchema);
    if (!result.ok) {
      throw new Error(result.code);
    }
    items.push(...result.data.items);
    total = result.data.total;
    nextColor = result.data.nextColor;
    if (items.length >= total || result.data.items.length === 0) {
      break;
    }
    page += 1;
  }
  return { items, total, nextColor };
}
