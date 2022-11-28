import { analytics } from '../../analytics/client';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';

const puppeteer = require('puppeteer');

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');

type SlackServiceDependencies = {
    lightdashConfig: LightdashConfig;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
};

const notifySlackError = async (
    error: unknown,
    url: string,
    client: any,
    event: any,
): Promise<void> => {
    console.error(`Unable to unfurl url ${JSON.stringify(error)}`);

    const unfurls = {
        [url]: {
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Unable to unfurl URL ${url}: ${error} `,
                    },
                },
            ],
        },
    };
    await client.chat
        .unfurl({
            ts: event.message_ts,
            channel: event.channel,
            unfurls,
        })
        .catch((er: any) =>
            console.error(`Unable to unfurl url ${JSON.stringify(er)}`),
        );
};

const uploadImage = async (
    screenshot: Buffer,
    client: any,
    event: any,
    context: any,
): Promise<string> => {
    // https://github.com/slackapi/node-slack-sdk/issues/1561
    const imageId = event.message_ts;

    const fileUpload = await client.files.upload({
        channels: event.channel,
        file: screenshot,
        filename: `dashboard-screenshot-${imageId}.png`,
        thread_ts: event.message_ts, // Upload on thread
    });

    const publicImage = await client.files.sharedPublicURL({
        file: fileUpload.file.id,
        token: context.userToken,
    });

    const permalink = publicImage?.file?.permalink_public;
    const permalinkParts = permalink.split('-');
    const pubSecret = permalinkParts[permalinkParts.length - 1];
    const imageUrl = `${publicImage?.file.url_private}?pub_secret=${pubSecret}`;
    return imageUrl;
};

const fetchDashboardScreenshot = async (url: string): Promise<Buffer> => {
    let browser;

    try {
        const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
        browser = await puppeteer.connect({
            browserWSEndpoint,
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: 1024,
            height: 768, // hardcoded
        });

        const blockedUrls = [
            'headwayapp.co',
            'rudderlabs.com',
            'analytics.lightdash.com',
            'cohere.so',
            'intercom.io',
        ];
        await page.setRequestInterception(true);
        page.on('request', (request: any) => {
            const requestUrl = request.url();
            if (blockedUrls.includes(requestUrl)) {
                request.abort();
                return;
            }

            request.continue();
        });
        await page.goto(url, {
            timeout: 100000,
            waitUntil: 'networkidle0',
        });
        const path = `/tmp/${encodeURIComponent(url)}.png`;
        const imageBuffer = await page.screenshot({
            path,
            clip: { x: 0, y: 0, width: 1024, height: 768 },
        });

        return imageBuffer;
        // return path
    } catch (e) {
        console.error(`Unable to fetch screenshots from headless chromeo ${e}`);
        return e;
    } finally {
        if (browser) await browser.close();
    }
};

export class SlackService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        spaceModel,
    }: SlackServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
    }

    private async unfurlChart(url: string, imageUrl: string): Promise<any> {
        const [projectUuid, chartUuid] = (await url.match(uuidRegex)) || [];

        const chart = this.savedChartModel.get(chartUuid);
        return {
            [url]: {
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: 'Chart unfurls not implemented',
                        },
                    },
                ],
            },
        };
    }

    private async unfurlDashboard(url: string, imageUrl: string): Promise<any> {
        const [projectUuid, dashboardUuid] = (await url.match(uuidRegex)) || [];

        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        // https://api.slack.com/reference/block-kit/blocks
        // https://app.slack.com/block-kit-builder/T0163M87MB9#%7B%22blocks%22:%5B%5D%7D
        const unfurls = {
            [url]: {
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: dashboard.name,
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${dashboard.description || '-'}`,
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Open in Lightdash',
                                emoji: true,
                            },
                            value: 'click_me_123',
                            url,
                            action_id: 'button-action',
                        },
                    },
                    {
                        type: 'image',
                        image_url: imageUrl,
                        alt_text: dashboard.name,
                    },
                ],
            },
        };
        return unfurls;
    }

    async unfurl(event: any, client: any, context: any): Promise<void> {
        event.links.map(async (l: any) => {
            const { url } = l;
            if (!url.startsWith(this.lightdashConfig.siteUrl)) {
                console.warn(
                    `URL to unfurl ${url} does not belong to this siteUrl ${this.lightdashConfig.siteUrl}, ignoring.`,
                );
                return;
            }
            const dashboardUrl = new RegExp(
                `/projects/${uuid}/dashboards/${uuid}`,
            );
            const chartUrl = new RegExp(`/projects/${uuid}/saved/${uuid}`);

            if (url.match(dashboardUrl)) {
                // Continue
            } else if (url.match(chartUrl)) {
                console.warn('Chart unfurl not implemented');
                return;
            } else {
                console.warn(
                    'URL to unfurl does not match dashboards or charts',
                );
                return;
            }

            analytics.track({
                event: 'share_slack.unfurl',
                properties: {
                    isDashboard: url.match(dashboardUrl) !== null,
                },
            });

            try {
                const screenshot = await fetchDashboardScreenshot(url);

                const imageUrl = await uploadImage(
                    screenshot,
                    client,
                    event,
                    context,
                );

                const unfurls = await (url.match(dashboardUrl)
                    ? this.unfurlDashboard(url, imageUrl)
                    : this.unfurlChart(url, imageUrl));
                client.chat
                    .unfurl({
                        ts: event.message_ts,
                        channel: event.channel,
                        unfurls,
                    })
                    .catch((e: any) => {
                        analytics.track({
                            event: 'share_slack.unfurl_error',
                            properties: {
                                error: `${e}`,
                            },
                        });
                        console.error(
                            `Unable to unfurl url ${url}: ${JSON.stringify(e)}`,
                        );
                    });
            } catch (e) {
                analytics.track({
                    event: 'share_slack.unfurl_error',
                    properties: {
                        error: `${e}`,
                    },
                });

                notifySlackError(e, url, client, event);
            }
        });
    }
}
