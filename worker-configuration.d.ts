interface Env {
  DB: D1Database
  ASSETS: Fetcher
  MEDIA_BUCKET: R2Bucket
  JWT_SECRET: string
}

interface ImportMetaEnv {
  readonly DB: D1Database
  readonly ASSETS: Fetcher
  readonly MEDIA_BUCKET: R2Bucket
  readonly JWT_SECRET: string
}

declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>
  }
  interface D1Result<T = Record<string, unknown>> {
    results: T[]
    success: boolean
    meta: { changes: number; last_row_id: number }
  }
  interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
  interface R2Bucket {
    put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
    get(key: string): Promise<{ body: ReadableStream } | null>
    delete(key: string): Promise<void>
  }
}

export {}
