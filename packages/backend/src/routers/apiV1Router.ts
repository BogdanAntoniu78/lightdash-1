import { ParameterError } from '@lightdash/common';
import express from 'express';
import passport from 'passport';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    redirectOIDCFailure,
    redirectOIDCSuccess,
    storeOIDCRedirect,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { userModel } from '../models/models';
import { UserModel } from '../models/UserModel';
import { healthService, userService } from '../services/services';
import { sanitizeEmailParam, sanitizeStringParam } from '../utils';
import { dashboardRouter } from './dashboardRouter';
import { inviteLinksRouter } from './inviteLinksRouter';
import { jobsRouter } from './jobsRouter';
import { organizationRouter } from './organizationRouter';
import { passwordResetLinksRouter } from './passwordResetLinksRouter';
import { projectRouter } from './projectRouter';
import { savedChartRouter } from './savedChartRouter';
import { userRouter } from './userRouter';

const puppeteer = require('puppeteer');
const html2canvas = require('html2canvas');

export const apiV1Router = express.Router();

apiV1Router.get('/livez', async (req, res, next) => {
    res.json({
        status: 'ok',
    });
});

apiV1Router.get('/health', async (req, res, next) => {
    healthService
        .getHealthState(!!req.user?.userUuid)
        .then((state) =>
            res.json({
                status: 'ok',
                results: state,
            }),
        )
        .catch(next);
});

apiV1Router.get('/flash', (req, res) => {
    res.json({
        status: 'ok',
        results: req.flash(),
    });
});

apiV1Router.post('/register', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await userService.registerNewUserWithOrg({
            firstName: sanitizeStringParam(req.body.firstName),
            lastName: sanitizeStringParam(req.body.lastName),
            email: sanitizeEmailParam(req.body.email),
            password: sanitizeStringParam(req.body.password),
        });
        const sessionUser = await userModel.findSessionUserByUUID(
            lightdashUser.userUuid,
        );
        req.login(sessionUser, (err) => {
            if (err) {
                next(err);
            }
            res.json({
                status: 'ok',
                results: lightdashUser,
            });
        });
    } catch (e) {
        next(e);
    }
});

apiV1Router.post('/login', passport.authenticate('local'), (req, res, next) => {
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
                results: UserModel.lightdashUserFromSession(req.user!),
            });
        }
    });
});

apiV1Router.get(
    lightdashConfig.auth.okta.loginPath,
    storeOIDCRedirect,
    passport.authenticate('okta', {
        scope: ['openid', 'profile', 'email'],
    }),
);

apiV1Router.get(
    lightdashConfig.auth.okta.callbackPath,
    passport.authenticate('okta', {
        failureRedirect: '/api/v1/oauth/failure',
        successRedirect: '/api/v1/oauth/success',
        failureFlash: true,
    }),
);

apiV1Router.get(
    lightdashConfig.auth.google.loginPath,
    storeOIDCRedirect,
    passport.authenticate('google', {
        scope: ['profile', 'email'],
    }),
);

apiV1Router.get(
    lightdashConfig.auth.google.callbackPath,
    passport.authenticate('google', {
        failureRedirect: '/api/v1/oauth/failure',
        successRedirect: '/api/v1/oauth/success',
        failureFlash: true,
    }),
);
apiV1Router.get('/oauth/failure', redirectOIDCFailure);
apiV1Router.get('/oauth/success', redirectOIDCSuccess);

apiV1Router.get('/logout', (req, res, next) => {
    req.logout();
    req.session.destroy((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
            });
        }
    });
});

apiV1Router.use('/saved', savedChartRouter);
apiV1Router.use('/invite-links', inviteLinksRouter);
apiV1Router.use('/org', organizationRouter);
apiV1Router.use('/user', userRouter);
apiV1Router.use('/projects/:projectUuid', projectRouter);
apiV1Router.use('/dashboards/:dashboardUuid', dashboardRouter);
apiV1Router.use('/password-reset', passwordResetLinksRouter);
apiV1Router.use('/jobs', jobsRouter);

apiV1Router.get('/screenshot', async (req, res, next) => {
    const { dashboardId } = req.query;

    if (!dashboardId) {
        next(new ParameterError());
    }

    const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://browser:3000',
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1400,
        height: 768, // hardcoded
    });
    await page.setExtraHTTPHeaders({ cookie: req.headers.cookie || '' }); // copy cookie

    const blockedUrls = [
        'headwayapp.co',
        'rudderlabs.com',
        'analytics.lightdash.com',
        'cohere.so',
        'intercom.io',
    ];
    await page.setRequestInterception(true);
    page.on('request', (request: any) => {
        const url = request.url();
        if (blockedUrls.includes(url)) {
            request.abort();
            return;
        }

        request.continue();
    });

    const dashboardUrl = `http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/dashboards/7aca576e-2aca-4c3c-b4ce-a63578203fb0/view`;
    await page.goto(dashboardUrl, {
        timeout: 100000,
        waitUntil: 'networkidle0',
    });

    //            const imageBuffer = await page.screenshot({ path: 'screenshot.png' });

    try {
        // await page.waitForSelector('#screenshot-dashboard');          // wait for the selector to load
        // const element = await page.$('#screenshot-dashboard');        // declare a variable with an ElementHandle

        // const dashboard = await page.$eval('#screenshot-dashboard', (el: any) => el.outerHTML);

        // const imageBuffer = await element.screenshot({ path: 'screenshot2.png' });

        const height = await page.$eval(
            '#screenshot-dashboard > div',
            (el: any) => el.style.height,
        );
        const numberHeight = height
            ? parseInt(height.replace('px', ''), 10)
            : 768; // await page.$(`document.querySelector('#screenshot-dashboard > div').style.height `);
        const imageBuffer = await page.screenshot({
            path: 'area.png',
            clip: { x: 0, y: 50, width: 1400, height: numberHeight },
        });
        /* const dashboard = await page.$$eval('div.react-grid-layout', (el: any) => el[0].innerHTML);

        const canvas = await html2canvas(dashboard, {
            windowWidth: 1024,
            windowHeight: 768
        });

            var myImage = canvas.toDataURL("image/png");
    

    
    
            // const html = await page.content(); // serialized HTML of page DOM.
    */

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': imageBuffer.length,
        });
        res.end(imageBuffer);
    } catch (e) {
        console.error(e);
        next(e);
    }

    await browser.close();
});
