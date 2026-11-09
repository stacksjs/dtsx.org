/**
 * One public name for dtsx in every benchmark: the native engine (the dtsx CLI
 * and binding) is "dtsx", and the @dtsx/dtsx SDK, which runs that engine
 * in-process, is "dtsx JS SDK", shown only beside other JavaScript SDKs. Raw snapshots keep their original names.
 */
export function benchmarkName(row: { id: string, name: string }): string {
  if (row.id === 'zig') return 'dtsx'
  if (row.id === 'dtsx') return 'dtsx JS SDK'
  return row.name
}
