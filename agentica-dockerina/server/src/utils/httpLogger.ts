export interface HttpLogEntry {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: any;
  };
  duration?: number;
}

export class HttpLogger {
  private static instance: HttpLogger;
  private logs: HttpLogEntry[] = [];
  private maxLogs: number = 100;

  private constructor() {}

  public static getInstance(): HttpLogger {
    if (!HttpLogger.instance) {
      HttpLogger.instance = new HttpLogger();
    }
    return HttpLogger.instance;
  }

  public logRequest(entry: Omit<HttpLogEntry, 'timestamp'>): void {
    const logEntry: HttpLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(logEntry);
    
    // Keep only the last N logs to prevent memory issues
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output for immediate visibility
    console.log('🌐 HTTP Request:', {
      timestamp: logEntry.timestamp,
      method: logEntry.method,
      url: logEntry.url,
      headers: this.sanitizeHeaders(logEntry.headers),
      bodySize: logEntry.body ? JSON.stringify(logEntry.body).length : 0,
    });

    // Log the actual request body for debugging if it's reasonably sized
    if (logEntry.body && JSON.stringify(logEntry.body).length < 2000) {
      console.log('📤 Request Body:', JSON.stringify(logEntry.body, null, 2));
    }

    if (logEntry.response) {
      const isError = logEntry.response.status >= 400;
      const logLevel = isError ? 'error' : 'log';
      
      console[logLevel](`${isError ? '❌' : '📥'} HTTP Response:`, {
        status: logEntry.response.status,
        statusText: logEntry.response.statusText,
        duration: logEntry.duration ? `${logEntry.duration}ms` : 'unknown',
        responseSize: logEntry.response.body ? JSON.stringify(logEntry.response.body).length : 0,
      });

      // For error responses, log the full response body
      if (isError && logEntry.response.body) {
        console.error('❗ Error Response Body:', JSON.stringify(logEntry.response.body, null, 2));
      }
    }
  }

  public getRecentLogs(count: number = 10): HttpLogEntry[] {
    return this.logs.slice(-count);
  }

  public clearLogs(): void {
    this.logs = [];
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'set-cookie'];
    const sanitized = { ...headers };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

/**
 * Intercepts fetch requests to log HTTP activity
 * Call this once during application startup
 */
export function setupFetchInterceptor(): void {
  const originalFetch = global.fetch;
  const logger = HttpLogger.getInstance();

  global.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startTime = Date.now();
    const url = input instanceof URL ? input.toString() : 
                typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    const headers = init?.headers ? 
      (init.headers instanceof Headers ? 
        Object.fromEntries(init.headers.entries()) : 
        init.headers as Record<string, string>) : {};

    let requestBody;
    if (init?.body) {
      try {
        requestBody = typeof init.body === 'string' ? 
          JSON.parse(init.body) : init.body;
      } catch {
        requestBody = init.body.toString();
      }
    }

    try {
      const response = await originalFetch(input, init);
      const duration = Date.now() - startTime;
      
      // Clone response to read body without consuming it
      const responseClone = response.clone();
      let responseBody;
      try {
        responseBody = await responseClone.json();
      } catch {
        // If not JSON, ignore body logging
      }

      logger.logRequest({
        method,
        url,
        headers,
        body: requestBody,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        },
        duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.logRequest({
        method,
        url,
        headers,
        body: requestBody,
        response: {
          status: 0,
          statusText: `Error: ${error}`,
          headers: {},
        },
        duration,
      });

      throw error;
    }
  };

  console.log('✅ HTTP request interceptor enabled');
}
