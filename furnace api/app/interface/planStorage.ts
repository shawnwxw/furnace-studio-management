export interface IdentifiedRecord {
  id: string;
}

export interface JsonStore<Item> {
  isList(value: unknown): value is Item[];
  read(): Promise<Item[]>;
  update(transform: (current: Item[]) => Item[] | Response | Promise<Item[] | Response>): Promise<Item[] | Response>;
}
