<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

Copy `.env.example` to `.env` and fill in real values (Mongo URI, JWT secret, etc.) before
running the app.

## Seed the admin account

There's no self-service way to become an admin — identity and workplace verification are
reviewed manually by an admin, so one has to exist before that flow can be tested. Run this
once against a running MongoDB instance to create the first admin account:

```bash
$ npm run seed:admin
```

This inserts a single `admin` user directly into MongoDB with verification already marked
`verified`. It's safe to re-run — if a user with the target email already exists, it exits
without making changes. Override the generated credentials with env vars (see `.env.example`):

```bash
$ ADMIN_EMAIL=admin@workpool.local ADMIN_PASSWORD=ChangeMe123! npm run seed:admin
```

## Authentication

`src/modules/auth` implements registration, login, logout, and password reset, backed by
`src/modules/users`. Design decisions:

- **Refresh tokens: yes.** Access tokens are short-lived (`JWT_EXPIRY`, 15m) so a leaked one
  expires fast; a longer-lived refresh token (`JWT_REFRESH_EXPIRY`, 7d, signed with the separate
  `JWT_REFRESH_SECRET`) is exchanged via `POST /auth/refresh` to get a new pair without forcing
  re-login. Refresh tokens are rotated on every use and their hash is stored on the user
  document, so `POST /auth/logout` (JWT-protected) can revoke the stored one immediately.
- **Self-registration is limited to `passenger` / `driver` / `both`.** `admin` cannot be set via
  `POST /auth/register` — the only admin account comes from `npm run seed:admin`.
- **Password reset has no email provider wired up yet.** `POST /auth/forgot-password` generates a
  token and logs it via `Logger` instead of emailing it, so the flow is testable locally
  (`npm run start:dev` and watch the console). Swap the `this.logger.log(...)` call in
  `auth.service.ts` for a real mailer when one is added. The response is always the same generic
  message regardless of whether the email exists, to avoid leaking which addresses are registered.

API docs (Swagger) are served at `/api/docs` when the app is running.

## Identity & workplace verification

`PATCH /users/me/verification` (self, multipart) accepts a NIC document upload + `nicNumber` +
`linkedinUrl`, and resets both `verification.identityStatus` and `verification.workplaceStatus`
to `pending`. `GET /admin/verifications?status=pending` and `PATCH /admin/verifications/:userId`
(admin-only, `@Roles(admin)`) drive the manual review — approving or rejecting sets both statuses
together (they're reviewed as one unit, sharing a single `reviewedBy`/`reviewedAt`/
`rejectionReason`), never automated.

- **NIC uploads are local disk storage, gated behind an authenticated route.** Files land in
  `NIC_UPLOAD_DIR` (default `./storage/nic-documents`, gitignored) under a random UUID filename —
  never under a static/public path. `GET /users/:userId/nic-document` is the only way to read one
  back, protected by `SelfOrAdminGuard` (owner or admin only). Restricted to jpg/png/pdf and 5MB
  via `MulterModule` (`fileFilter` + `limits.fileSize` in `users.module.ts`), rejecting anything
  else at the API before it ever touches disk. This is fine for local dev/demo; swapping in
  object storage (e.g. S3) later just means changing the multer storage engine.
- **`nicNumber` is encrypted at rest**, not hashed — admins need to read it during review, so it's
  reversible: AES-256-GCM via `common/utils/encryption.util.ts`, keyed by `ENCRYPTION_KEY` (32-byte
  hex, separate from the JWT secrets). The field is `select: false` on the schema, so it's only
  ever pulled from the DB where explicitly needed (verification submission and the admin listing).
- **LinkedIn URLs are validated against the `linkedin.com` domain** (`LINKEDIN_URL_REGEX`) —
  matches the project rule that workplace verification is a submitted LinkedIn profile, not
  automated email-domain checking.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
