import { Sandbox } from 'e2b';
import { ShellCommand, FileOperation, CodeExecution } from '@manus-replica/shared';

export class E2BService {
  private sandbox: Sandbox | null = null;
  private sessionId: string | null = null;

  async getOrCreateSession(): Promise<{ sessionId: string }> {
    if (!this.sandbox) {
      this.sandbox = await Sandbox.create({
        template: 'base',
        apiKey: process.env.E2B_API_KEY
      });
      this.sessionId = this.sandbox.id;
    }

    return { sessionId: this.sessionId! };
  }

  async createSession(): Promise<{ sessionId: string }> {
    this.sandbox = await Sandbox.create({
      template: 'base',
      apiKey: process.env.E2B_API_KEY
    });
    this.sessionId = this.sandbox.id;

    return { sessionId: this.sessionId };
  }

  async executeShellCommand(command: ShellCommand): Promise<any> {
    if (!this.sandbox) {
      throw new Error('No active session');
    }

    const process = await this.sandbox.process.start({
      cmd: command.command,
      cwd: command.workingDirectory || '/home/user'
    });

    const output = await process.output;

    return {
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.exitCode
    };
  }

  async performFileOperation(operation: FileOperation): Promise<any> {
    if (!this.sandbox) {
      throw new Error('No active session');
    }

    switch (operation.type) {
      case 'read':
        const content = await this.sandbox.filesystem.read(operation.path);
        return { content };

      case 'write':
        await this.sandbox.filesystem.write(operation.path, operation.content || '');
        return { success: true };

      case 'create':
        if (operation.path.endsWith('/')) {
          await this.sandbox.filesystem.makeDir(operation.path);
        } else {
          await this.sandbox.filesystem.write(operation.path, operation.content || '');
        }
        return { success: true };

      case 'delete':
        await this.sandbox.filesystem.remove(operation.path);
        return { success: true };

      case 'list':
        const files = await this.sandbox.filesystem.list(operation.path);
        return { files };

      default:
        throw new Error(`Unknown file operation: ${operation.type}`);
    }
  }

  async executeCode(execution: CodeExecution): Promise<any> {
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

    const output = await process.output;

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
  }

  async closeSession(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.close();
      this.sandbox = null;
      this.sessionId = null;
    }
  }
}