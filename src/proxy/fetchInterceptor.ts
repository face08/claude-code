import { appendFileSync } from 'fs'
import { join } from 'path'

const originalFetch = globalThis.fetch

const logFilePath = join(process.cwd(), 'fetch.log')

let requestCounter = 0

function logToFile(message: string): void {
  try {
    appendFileSync(logFilePath, message + '\n')
  } catch (err) {
    console.error('Failed to write to log file:', logFilePath, err)
  }
}

export function interceptFetch(): void {
  globalThis.fetch = async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    requestCounter++
    const startTime = Date.now()
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method || (input instanceof Request ? input.method : 'GET')
    
    let logMessage = '\n' + '='.repeat(80) + '\n'
    logMessage += `[FETCH INTERCEPTED #${requestCounter}] [${new Date(startTime).toLocaleString('zh-CN')}]\n`
    logMessage += '='.repeat(80) + '\n'
    logMessage += `[URL]: ${url}\n`
    logMessage += `[Method]: ${method}\n`
    
    if (init?.headers) {
      const headers = new Headers(init.headers)
      logMessage += `[Headers]:\n`
      headers.forEach((value, key) => {
        logMessage += `  ${key}: ${value}\n`
      })
    }
    
    if (init?.body) {
      try {
        const bodyText = typeof init.body === 'string' 
          ? init.body 
          : await new Response(init.body).text()
        logMessage += `[Body]: ${bodyText}\n`
      } catch {
        logMessage += `[Body]: [binary or unreadable]\n`
      }
    }
    
    logMessage += `[Start Time]: ${new Date(startTime).toISOString()}\n`
    
    logToFile(logMessage)
    
    try {
      const response = await originalFetch(input, init)
      const duration = Date.now() - startTime
      
      logMessage = '\n[RESPONSE]\n'
      logMessage += `[Status]: ${response.status} ${response.statusText}\n`
      logMessage += `[Duration]: ${duration}ms\n`
      logMessage += `[Response Headers]:\n`
      response.headers.forEach((value, key) => {
        logMessage += `  ${key}: ${value}\n`
      })
      
      const contentType = response.headers.get('content-type') || ''
      const contentLength = response.headers.get('content-length')
      
      logMessage += `[Content-Type]: ${contentType}\n`
      logMessage += `[Content-Length]: ${contentLength || 'unknown'}\n`
      
      const isStreaming = contentType.includes('text/event-stream') || 
                         contentType.includes('application/x-ndjson') ||
                         contentType.includes('stream') ||
                         contentLength === null ||
                         contentLength === undefined ||
                         contentLength === ''
      
      logMessage += `[Is Streaming]: ${isStreaming}\n`
      
      if (isStreaming) {
        logMessage += `[Response Body Type]: Streaming\n`
        logMessage += `[Response Body]: \n`
        
        logToFile(logMessage)
        
        const clonedResponse = response.clone()
        
        setTimeout(async () => {
          const reader = clonedResponse.body?.getReader()
          if (reader) {
            let chunkCount = 0
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                
                const chunk = new TextDecoder('utf-8').decode(value)
                chunkCount++
                const chunkLog = `[STREAM CHUNK ${chunkCount}]:\n${chunk}\n`
                logToFile(chunkLog)
              }
              logToFile('[STREAM END]\n')
            } catch (streamErr) {
              logToFile(`[STREAM ERROR]: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}\n`)
            }
          }
        }, 0)
        
        return response
      } else {
        const responseBody = await response.clone().text()
        logMessage += `[Response Body]: ${responseBody}\n`
        logMessage += '='.repeat(80) + '\n'
        
        logToFile(logMessage)
        
        return response
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      logMessage = '\n[ERROR]\n'
      logMessage += `[Duration]: ${duration}ms\n`
      logMessage += `[Error]: ${error instanceof Error ? error.message : String(error)}\n`
      logMessage += `[Error Stack]: ${error instanceof Error ? error.stack : 'N/A'}\n`
      logMessage += '='.repeat(80) + '\n'
      
      logToFile(logMessage)
      
      throw error
    }
  }
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch
}