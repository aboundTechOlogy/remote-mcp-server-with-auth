import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockSupabaseClient = {
  rpc: vi.fn(),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Now import the modules
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDatabaseTools } from '../../../src/tools/database-tools'
import { mockProps, mockPrivilegedProps } from '../../fixtures/auth.fixtures'
import { mockEnv } from '../../mocks/oauth.mock'
import { mockTableColumns, mockQueryResult } from '../../fixtures/database.fixtures'

describe('Database Tools', () => {
  let mockServer: McpServer
  
  beforeEach(() => {
    vi.clearAllMocks()
    mockServer = new McpServer({ name: 'test', version: '1.0.0' })
    
    // Setup Supabase mocks
    mockSupabaseClient.rpc.mockImplementation((functionName: string, params?: any) => {
      if (functionName === 'get_table_columns') {
        return Promise.resolve({ data: mockTableColumns, error: null })
      }
      if (functionName === 'execute_sql') {
        const sql = params?.query || '';
        if (sql.includes('SELECT')) {
          return Promise.resolve({ data: mockQueryResult, error: null })
        }
        if (sql.includes('INSERT') || sql.includes('UPDATE') || sql.includes('DELETE')) {
          return Promise.resolve({ data: [{ affectedRows: 1 }], error: null })
        }
        return Promise.resolve({ data: [], error: null })
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC function') })
    })
  })

  describe('registerDatabaseTools', () => {
    it('should register listTables and queryDatabase for regular users', () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      expect(toolSpy).toHaveBeenCalledWith(
        'listTables',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      )
      expect(toolSpy).toHaveBeenCalledWith(
        'queryDatabase',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      )
      expect(toolSpy).toHaveBeenCalledTimes(2)
    })

    it('should register all tools for privileged users', () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      
      registerDatabaseTools(mockServer, mockEnv as any, mockPrivilegedProps)
      
      expect(toolSpy).toHaveBeenCalledWith(
        'listTables',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      )
      expect(toolSpy).toHaveBeenCalledWith(
        'queryDatabase',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      )
      expect(toolSpy).toHaveBeenCalledWith(
        'executeDatabase',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      )
      expect(toolSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('listTables tool', () => {
    it('should return table schema successfully', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      // Get the registered tool handler
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'listTables')
      const handler = toolCall![3] as Function
      
      const result = await handler({})
      
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('Database Tables and Schema')
      expect(result.content[0].text).toContain('users')
      expect(result.content[0].text).toContain('posts')
    })

    it('should handle database errors', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Database connection failed'))
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)

      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'listTables')
      const handler = toolCall![3] as Function

      const result = await handler({})

      expect(result.content[0].text).toContain('Error')
    })
  })

  describe('queryDatabase tool', () => {
    it('should execute SELECT queries successfully', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'queryDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'SELECT * FROM users' })
      
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('Query Results')
      expect(result.content[0].text).toContain('SELECT * FROM users')
    })

    it('should reject write operations', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'queryDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'INSERT INTO users VALUES (1, \'test\')' })
      
      expect(result.content[0].text).toContain('Write operations are not allowed')
    })

    it('should reject invalid SQL', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'queryDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'SELECT * FROM users; DROP TABLE users' })
      
      expect(result.content[0].text).toContain('Invalid SQL query')
    })

    it('should handle database errors', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Database connection failed'))
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)

      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'queryDatabase')
      const handler = toolCall![3] as Function

      const result = await handler({ sql: 'SELECT * FROM users' })

      expect(result.content[0].text).toContain('Database query error')
    })
  })

  describe('executeDatabase tool', () => {
    it('should only be available to privileged users', async () => {
      // Regular user should not get executeDatabase
      const toolSpy1 = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockProps)
      
      const executeToolCall = toolSpy1.mock.calls.find(call => call[0] === 'executeDatabase')
      expect(executeToolCall).toBeUndefined()
      
      // Privileged user should get executeDatabase
      const mockServer2 = new McpServer({ name: 'test2', version: '1.0.0' })
      const toolSpy2 = vi.spyOn(mockServer2, 'tool')
      registerDatabaseTools(mockServer2, mockEnv as any, mockPrivilegedProps)
      
      const privilegedExecuteToolCall = toolSpy2.mock.calls.find(call => call[0] === 'executeDatabase')
      expect(privilegedExecuteToolCall).toBeDefined()
    })

    it('should execute write operations for privileged users', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockPrivilegedProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'executeDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'INSERT INTO users VALUES (1, \'test\')' })
      
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('Write Operation Executed Successfully')
      expect(result.content[0].text).toContain('coleam00')
    })

    it('should execute read operations for privileged users', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockPrivilegedProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'executeDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'SELECT * FROM users' })
      
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('Read Operation Executed Successfully')
    })

    it('should reject invalid SQL', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      registerDatabaseTools(mockServer, mockEnv as any, mockPrivilegedProps)
      
      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'executeDatabase')
      const handler = toolCall![3] as Function
      
      const result = await handler({ sql: 'SELECT * FROM users; DROP TABLE users' })
      
      expect(result.content[0].text).toContain('Invalid SQL statement')
    })

    it('should handle database errors', async () => {
      const toolSpy = vi.spyOn(mockServer, 'tool')
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Database connection failed'))
      registerDatabaseTools(mockServer, mockEnv as any, mockPrivilegedProps)

      const toolCall = toolSpy.mock.calls.find(call => call[0] === 'executeDatabase')
      const handler = toolCall![3] as Function

      const result = await handler({ sql: 'INSERT INTO users VALUES (1, \'test\')' })

      expect(result.content[0].text).toContain('Database execution error')
    })
  })
})