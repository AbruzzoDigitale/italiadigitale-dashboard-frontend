export type BulkDeleteRequest = {
  ids: number[];
};

export type BulkDeleteItemError = {
  id: number;
  detail: string;
};

export type BulkDeleteResponse = {
  requested: number;
  deleted_ids: number[];
  errors: BulkDeleteItemError[];
};
