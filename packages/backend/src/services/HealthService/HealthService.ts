import {
    HealthState,
    LightdashInstallType,
    LightdashMode,
    UnexpectedDatabaseError,
} from '@lightdash/common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { LightdashConfig } from '../../config/parseConfig';
import { getMigrationStatus } from '../../database/database';
import { OrganizationModel } from '../../models/OrganizationModel';
import { VERSION } from '../../version';

type HealthServiceDependencies = {
    lightdashConfig: LightdashConfig;
    organizationModel: OrganizationModel;
};

const hasSlackConfig = (): boolean =>
    process.env.SLACK_APP_TOKEN !== undefined &&
    process.env.SLACK_SIGNING_SECRET !== undefined;

export class HealthService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationModel: OrganizationModel;

    constructor({
        organizationModel,
        lightdashConfig,
    }: HealthServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.organizationModel = organizationModel;
    }

    async getHealthState(isAuthenticated: boolean): Promise<HealthState> {
        const { isComplete, currentVersion } = await getMigrationStatus();

        if (!isComplete) {
            throw new UnexpectedDatabaseError(
                'Database has not been migrated yet',
                { currentVersion },
            );
        }

        const requiresOrgRegistration =
            !(await this.organizationModel.hasOrgs());

        const localDbtEnabled =
            process.env.LIGHTDASH_INSTALL_TYPE !==
                LightdashInstallType.HEROKU &&
            this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA;
        return {
            healthy: true,
            mode: this.lightdashConfig.mode,
            version: VERSION,
            localDbtEnabled,
            defaultProject: undefined,
            isAuthenticated,
            requiresOrgRegistration,
            latest: { version: getDockerHubVersion() },
            rudder: this.lightdashConfig.rudder,
            sentry: this.lightdashConfig.sentry,
            intercom: this.lightdashConfig.intercom,
            cohere: this.lightdashConfig.cohere,
            siteUrl: this.lightdashConfig.siteUrl,
            staticIp: this.lightdashConfig.staticIp,
            query: this.lightdashConfig.query,
            hasSlack: hasSlackConfig(),
            auth: {
                disablePasswordAuthentication:
                    this.lightdashConfig.auth.disablePasswordAuthentication,
                google: {
                    loginPath: this.lightdashConfig.auth.google.loginPath,
                    oauth2ClientId:
                        this.lightdashConfig.auth.google.oauth2ClientId,
                },
                okta: {
                    loginPath: this.lightdashConfig.auth.okta.loginPath,
                    enabled: !!this.lightdashConfig.auth.okta.oauth2ClientId,
                },
            },
            hasEmailClient: !!this.lightdashConfig.smtp,
        };
    }
}
