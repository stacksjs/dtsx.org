/** Independent annotated and inference-heavy libraries, shared by every adapter. */
export type Workload = 'annotated' | 'inferred'
export const workloads: Workload[] = ['annotated', 'inferred']

export function moduleSource(workload: Workload, i: number): string {
  if (workload === 'annotated') {
    return `export interface Model${i} { readonly id: string; value: number; tags?: readonly string[] }
export type Patch${i} = Partial<Pick<Model${i}, 'value' | 'tags'>>;
export enum Status${i} { Ready = 'ready', Pending = 'pending' }
export function create${i}(id: string, value: number): Model${i} { return { id, value } }
export class Store${i}<T> {
  private readonly data: T;
  constructor(data: T) { this.data = data }
  get(): T { return this.data }
}
export type Listener${i}<T> = (value: T) => void;
export const version${i}: string = '1.0.0';
`
  }
  return `${i ? `import { create${i - 1} } from './module${i - 1}.js';\n` : ''}export const settings${i} = { retries: 3, label: 'build', enabled: true };
export const values${i} = [1, 2, 3];
export function create${i}(id = 'item', value = 0) { return { id, value, tags: ['default'] } }
export function project${i}(item = create${i}()) { return { id: item.id, total: item.value + 1 } }
export const factory${i} = (id = 'item') => ({ id, count: 0 });
export class Store${i} {
  private item = create${i}();
  get() { return this.item }
}
export const linked${i} = create${i ? i - 1 : i}('linked', 1);
`
}

export function entrySource(workload: Workload, count: number): string {
  return Array.from({ length: count }, (_, i) => workload === 'annotated'
    ? `export { create${i}, Store${i}, Status${i}, version${i}, type Model${i}, type Patch${i}, type Listener${i} } from './module${i}.js'`
    : `export { create${i}, project${i}, factory${i}, Store${i}, settings${i}, values${i}, linked${i} } from './module${i}.js'`).join('\n')
}

export function positiveConsumer(workload: Workload, imported: string, count: number): string {
  const guards = `type IsAny<T> = 0 extends (1 & T) ? true : false;
type MustBeFalse<T extends false> = T;
type MutableInputs<T extends readonly unknown[]> = { -readonly [K in keyof T]: T[K] };
type SameInputs<A extends readonly unknown[], B extends readonly unknown[]> = [MutableInputs<A>] extends [MutableInputs<B>] ? [MutableInputs<B>] extends [MutableInputs<A>] ? true : false : false;
type MustBeTrue<T extends true> = T;
`
  if (workload === 'annotated') {
    return guards + Array.from({ length: count }, (_, i) => `import { create${i}, Store${i}, Status${i}, type Model${i}, type Patch${i}, version${i}, type Listener${i} } from '${imported}';
const item${i}: Model${i} = create${i}('ok', ${i});
const value${i}: number = item${i}.value;
const result${i}: string = new Store${i}<string>('ok').get();
const status${i}: Status${i} = Status${i}.Ready;
const patch${i}: Patch${i} = { value: ${i} };
const versionText${i}: string = version${i};
const listener${i}: Listener${i}<number> = (value: number): void => { void value };
type CreateInputs${i} = MustBeTrue<SameInputs<Parameters<typeof create${i}>, [string, number]>>;
type StoreInputs${i} = MustBeTrue<SameInputs<ConstructorParameters<typeof Store${i}<string>>, [string]>>;
type GetterInputs${i} = MustBeTrue<SameInputs<Parameters<Store${i}<string>['get']>, []>>;
${[`Model${i}['id']`, `Model${i}['value']`, `NonNullable<Model${i}['tags']>[number]`, `ReturnType<typeof create${i}>['value']`, `ReturnType<Store${i}<string>['get']>`, `Status${i}`, `Patch${i}['value']`, `typeof version${i}`, `Listener${i}<number>`, `Parameters<Listener${i}<number>>[0]`, `Parameters<typeof create${i}>[number]`, `ConstructorParameters<typeof Store${i}<string>>[number]`, `Parameters<Store${i}<string>['get']>[number]`].map((type, check) => `type NoAny${i}_${check} = MustBeFalse<IsAny<${type}>>;`).join('\n')}`).join('\n')
  }
  return guards + Array.from({ length: count }, (_, i) => `import { create${i}, project${i}, factory${i}, Store${i}, settings${i}, values${i}, linked${i} } from '${imported}';
const item${i}: { id: string; value: number; tags: string[] } = create${i}('ok', ${i});
const projected${i}: { id: string; total: number } = project${i}();
const built${i}: { id: string; count: number } = factory${i}('ok');
const stored${i}: { id: string; value: number; tags: string[] } = new Store${i}().get();
const config${i}: { retries: number; label: string; enabled: boolean } = settings${i};
const numbers${i}: number[] = values${i};
const linkedValue${i}: { id: string; value: number; tags: string[] } = linked${i};
const widened${i}: ReturnType<typeof create${i}> = { id: 'different', value: 42, tags: ['other'] };
const flexibleProject${i}: ReturnType<typeof project${i}> = { id: 'different', total: 42 };
const flexibleFactory${i}: ReturnType<typeof factory${i}> = { id: 'different', count: 42 };
const flexibleStore${i}: ReturnType<Store${i}['get']> = { id: 'different', value: 42, tags: ['other'] };
const flexibleSettings${i}: typeof settings${i} = { retries: 42, label: 'changed', enabled: false };
const flexibleValues${i}: typeof values${i} = [42, 43, 44, 45];
const flexibleLinked${i}: typeof linked${i} = { id: 'different', value: 42, tags: ['other'] };
type CreateInputs${i} = MustBeTrue<SameInputs<Parameters<typeof create${i}>, [id?: string, value?: number]>>;
type ProjectInputs${i} = MustBeTrue<SameInputs<Parameters<typeof project${i}>, [item?: { id: string; value: number; tags: string[] }]>>;
type FactoryInputs${i} = MustBeTrue<SameInputs<Parameters<typeof factory${i}>, [id?: string]>>;
type StoreInputs${i} = MustBeTrue<SameInputs<ConstructorParameters<typeof Store${i}>, []>>;
type GetterInputs${i} = MustBeTrue<SameInputs<Parameters<Store${i}['get']>, []>>;
${[
  `ReturnType<typeof create${i}>['id']`, `ReturnType<typeof create${i}>['value']`, `ReturnType<typeof create${i}>['tags'][number]`,
  `ReturnType<typeof project${i}>['id']`, `ReturnType<typeof project${i}>['total']`,
  `ReturnType<typeof factory${i}>['id']`, `ReturnType<typeof factory${i}>['count']`,
  `ReturnType<Store${i}['get']>['id']`, `ReturnType<Store${i}['get']>['value']`, `ReturnType<Store${i}['get']>['tags'][number]`,
  `typeof settings${i}['retries']`, `typeof settings${i}['label']`, `typeof settings${i}['enabled']`,
  `typeof values${i}[number]`, `typeof linked${i}['id']`, `typeof linked${i}['value']`, `typeof linked${i}['tags'][number]`,
  `Parameters<typeof create${i}>[number]`, `Parameters<typeof factory${i}>[number]`, `ConstructorParameters<typeof Store${i}>[number]`, `Parameters<Store${i}['get']>[number]`,
  `NonNullable<Parameters<typeof project${i}>[0]>['id']`, `NonNullable<Parameters<typeof project${i}>[0]>['value']`, `NonNullable<Parameters<typeof project${i}>[0]>['tags'][number]`,
].map((type, check) => `type NoAny${i}_${check} = MustBeFalse<IsAny<${type}>>;`).join('\n')}`).join('\n')
}

export function negativeConsumer(workload: Workload, imported: string): string {
  return `import { create0, Store0 } from '${imported}';
const wrong: string = create0('ok', 1).value;
${workload === 'annotated' ? "const bad: number = new Store0<string>('ok').get();" : 'const bad: number = new Store0().get().id;'}`
}
