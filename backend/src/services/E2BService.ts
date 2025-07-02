import { Sandbox } from 'e2b';
import { ShellCommand, FileOperation, CodeExecution } from '@manus-replica/shared';

export class E2BService {
  private sandbox: Sandbox | null = null;
  private sessionId: string | null = null;

  private isTimeoutError(error: any): boolean {
    return error.message && error.message.includes('timed out');
  }

  private async handleTimeoutError(): Promise<void> {
    console.warn('[E2BService] Session timeout detected, attempting to resume session...');
    await this.resumeSession();
  }

  async getOrCreateSession(): Promise<{ sessionId: string }> {
    if (!this.sandbox) {
      await this.createSession();
    }

    return { sessionId: this.sessionId! };
  }

  async createSession(): Promise<{ sessionId: string }> {
    try {
      this.sandbox = await Sandbox.create({
        template: 'base',
        apiKey: process.env.E2B_API_KEY
      });
      this.sessionId = this.sandbox.id;
      console.log('[E2BService] Created new session:', this.sessionId);
      return { sessionId: this.sessionId };
    } catch (error) {
      console.error('[E2BService] Failed to create session:', error);
      throw error;
    }
  }

  async resumeSession(): Promise<{ sessionId: string } | null> {
    if (this.sessionId) {
      try {
        this.sandbox = await Sandbox.reconnect(this.sessionId);
        console.log('[E2BService] Resumed session:', this.sessionId);
        return { sessionId: this.sessionId };
      } catch (error) {
        console.error('[E2BService] Failed to resume session:', error);
        // fallback: create a new session if resume fails
        return this.createSession();
      }
    }
    return null;
  }

  async executeShellCommand(command: ShellCommand): Promise<any> {
    try {
      if (!this.sandbox) {
        throw new Error('No active session');
      }

      const process = await this.sandbox.process.start({
        cmd: command.command,
        cwd: command.workingDirectory || '/home/user'
      });

      await process.wait(); // Wait for the process to finish
      const output = process.output;

      return {
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: output.exitCode
      };
    } catch (error) {
      if (this.isTimeoutError(error)) {
        await this.handleTimeoutError();
        // Retry the operation once
        return this.executeShellCommand(command);
      }
      throw error;
    }
  }

  async performFileOperation(operation: FileOperation): Promise<any> {
    try {
      if (!this.sandbox) {
        throw new Error('No active session');
      }

      // Convert relative paths to absolute paths to avoid warnings
      const normalizePath = (path: string): string => {
        if (path.startsWith('./')) {
          return path.replace('./', '/home/user/');
        }
        if (path.startsWith('../')) {
          return path.replace('../', '/home/user/');
        }
        if (!path.startsWith('/')) {
          return `/home/user/${path}`;
        }
        return path;
      };

      const absolutePath = normalizePath(operation.path);

      switch (operation.type) {
        case 'read':
          const content = await this.sandbox.filesystem.read(absolutePath);
          return { content };

        case 'write':
          await this.sandbox.filesystem.write(absolutePath, operation.content || '');
          return { success: true };

        case 'create':
          if (absolutePath.endsWith('/')) {
            await this.sandbox.filesystem.makeDir(absolutePath);
          } else {
            await this.sandbox.filesystem.write(absolutePath, operation.content || '');
          }
          return { success: true };

        case 'delete':
          await this.sandbox.filesystem.remove(absolutePath);
          return { success: true };

        case 'list':
          const files = await this.sandbox.filesystem.list(absolutePath);
          return { files };

        default:
          throw new Error(`Unknown file operation: ${operation.type}`);
      }
    } catch (error) {
      if (this.isTimeoutError(error)) {
        await this.handleTimeoutError();
        // Retry the operation once
        return this.performFileOperation(operation);
      }
      throw error;
    }
  }

  async executeCode(execution: CodeExecution): Promise<any> {
    try {
      if (!this.sandbox) {
        throw new Error('No active session');
      }

      let command: string;
      let filename: string;

      switch (execution.language) {
        case 'python':
          filename = `/tmp/script_${Date.now()}.py`;
          await this.sandbox.filesystem.write(filename, execution.code);
          command = `python3 ${filename}`;
          break;

        case 'javascript':
          filename = `/tmp/script_${Date.now()}.js`;
          await this.sandbox.filesystem.write(filename, execution.code);
          command = `node ${filename}`;
          break;

        case 'bash':
          filename = `/tmp/script_${Date.now()}.sh`;
          await this.sandbox.filesystem.write(filename, execution.code);
          await this.sandbox.process.start({ cmd: `chmod +x ${filename}` });
          command = filename;
          break;

        default:
          throw new Error(`Unsupported language: ${execution.language}`);
      }

      const process = await this.sandbox.process.start({
        cmd: command,
        cwd: '/home/user'
      });

      await process.wait();
      const output = process.output;

      // Clean up temporary file
      try {
        await this.sandbox.filesystem.remove(filename);
      } catch (e) {
        // Ignore cleanup errors
      }

      return {
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: output.exitCode
      };
    } catch (error) {
      if (this.isTimeoutError(error)) {
        await this.handleTimeoutError();
        // Retry the operation once
        return this.executeCode(execution);
      }
      throw error;
    }
  }

  async closeSession(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.close();
        console.log('[E2BService] Closed session:', this.sessionId);
      } catch (error) {
        console.warn('[E2BService] Error closing session:', error);
      }
      this.sandbox = null;
      this.sessionId = null;
    }
  }
}