import type { CloudConfig } from '@stacksjs/types'
import type { CloudConfig as TsCloudConfig } from '@stacksjs/ts-cloud'

/** An isolated static tenant on the existing Stacks host. */
export const tsCloud: TsCloudConfig = {
  project: { name: 'dtsx-org', slug: 'dtsx-org', region: 'us-east-1' },
  stateDir: 'storage/cloud',
  cloud: { provider: 'hetzner', attachTo: 'stacks' },
  mode: 'server',
  environments: {
    production: {
      type: 'production',
      deployBranch: 'main',
      region: 'us-east-1',
      variables: { APP_ENV: 'production', NODE_ENV: 'production' },
    },
  },
  infrastructure: {
    compute: {
      instances: 1,
      size: 'small',
      disk: { size: 20, type: 'ssd', encrypted: true },
      webServer: 'rpx',
      proxy: { engine: 'rpx', onDemandTls: true },
    },
  },
  sites: {
    dtsx: { deploy: 'server', root: 'dist', path: '/', domain: 'dtsx.org', build: 'bun run build' },
    www: { domain: 'www.dtsx.org', redirect: 'https://dtsx.org' },
  },
}

export default {} satisfies CloudConfig
