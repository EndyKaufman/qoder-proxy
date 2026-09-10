import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { QODER_MODELS } from './qoder-cli/qoder-cli.models';

const OPENAI_ALIASES = [
  { id: 'gpt-4', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'gpt-4-turbo', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'gpt-4o', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'gpt-4o-mini', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'gpt-3.5-turbo', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'o1', resolves_to: 'ultimate', description: 'Alias → ultimate tier' },
  { id: 'o1-mini', resolves_to: 'performance', description: 'Alias → performance tier' },
  { id: 'o3-mini', resolves_to: 'performance', description: 'Alias → performance tier' },
  { id: 'claude-3-opus', resolves_to: 'ultimate', description: 'Alias → ultimate tier' },
  { id: 'claude-3-sonnet', resolves_to: 'performance', description: 'Alias → performance tier' },
  { id: 'claude-3-haiku', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'claude-3.5-sonnet', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'claude-3.5-haiku', resolves_to: 'performance', description: 'Alias → performance tier' },
  { id: 'claude-3.7-sonnet', resolves_to: 'auto', description: 'Alias → auto tier' },
  { id: 'gemini-pro', resolves_to: 'performance', description: 'Alias → performance tier' },
  { id: 'gemini-flash', resolves_to: 'efficient', description: 'Alias → efficient tier' },
  { id: 'qwen', resolves_to: 'qmodel', description: 'Alias → Qwen3.6-Plus' },
  { id: 'deepseek', resolves_to: 'dmodel', description: 'Alias → DeepSeek-V4-Pro' },
  { id: 'deepseek-v4', resolves_to: 'dmodel', description: 'Alias → DeepSeek-V4-Pro' },
  { id: 'deepseek-v4-flash', resolves_to: 'dfmodel', description: 'Alias → DeepSeek-V4-Flash' },
  { id: 'glm', resolves_to: 'gm51model', description: 'Alias → GLM-5.1' },
  { id: 'glm51', resolves_to: 'gm51model', description: 'Alias → GLM-5.1' },
  { id: 'qwen36plus', resolves_to: 'qmodel', description: 'Alias → Qwen3.6-Plus' },
  { id: 'kimi', resolves_to: 'kmodel', description: 'Alias → Kimi-K2.6' },
  { id: 'minimax', resolves_to: 'mmodel', description: 'Alias → MiniMax new model' },
];

const TS = 1700000000;

@ApiTags('models')
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class ModelsController {
  @Get('models')
  @ApiOperation({ summary: 'List available models' })
  @ApiResponse({ status: 200, description: 'Model list in OpenAI format' })
  getModels() {
    const nativeModels = QODER_MODELS.map((m) => ({
      id: m.id,
      object: 'model',
      created: TS,
      owned_by: `qoder-${m.tier}`,
      qoder: {
        label: m.label,
        tier: m.tier,
        description: m.description,
        is_alias: false,
      },
    }));

    const aliasModels = OPENAI_ALIASES.map((a) => ({
      id: a.id,
      object: 'model',
      created: TS,
      owned_by: 'qoder-alias',
      qoder: {
        label: a.id,
        tier: 'alias',
        description: a.description,
        resolves_to: a.resolves_to,
        is_alias: true,
      },
    }));

    return { object: 'list', data: [...nativeModels, ...aliasModels] };
  }

  @Post('embeddings')
  @ApiOperation({ summary: 'Embeddings (not supported)' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  embeddings(@Res() res: Response) {
    return res.status(501).json({
      error: {
        message:
          'Embeddings are not supported. qodercli does not generate embeddings. ' +
          'Use OpenAI, Cohere, or a local model (Ollama / sentence-transformers) instead.',
        type: 'not_implemented_error',
        code: 'endpoint_not_supported',
      },
    });
  }

  // Catch-all for unknown /v1/* routes
  @Get('*')
  catchAllGet(@Req() req: Request, @Res() res: Response) {
    return res.status(404).json({
      error: {
        message: `Unknown endpoint: ${req.method} /v1${req.path}. See GET /v1/models for available endpoints.`,
        type: 'invalid_request_error',
        code: 'endpoint_not_found',
      },
    });
  }

  @Post('*')
  catchAllPost(@Req() req: Request, @Res() res: Response) {
    return res.status(404).json({
      error: {
        message: `Unknown endpoint: ${req.method} /v1${req.path}. See GET /v1/models for available endpoints.`,
        type: 'invalid_request_error',
        code: 'endpoint_not_found',
      },
    });
  }
}
