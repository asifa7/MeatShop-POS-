import { configService, AppConfigSchema, AppConfig } from '../config/config_service';

export const ConfigSchema = AppConfigSchema;
export type { AppConfig };
export const configManager = configService;
export { configService };
export const config = configService.get();

