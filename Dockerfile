FROM node:8

LABEL maintainer="havard.ranum@me.com"

# Install latest chrome dev package.
# Note: this installs the necessary libs to make the bundled version of Chromium that Pupppeteer
# installs, work.
RUN apt-get update && apt-get install -y wget --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-unstable \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge --auto-remove -y curl \
    && rm -rf /src/*.deb

# Uncomment to skip the chromium download when installing puppeteer. If you do,
# you'll need to launch puppeteer with:
#     browser.launch({executablePath: 'google-chrome-unstable'})
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

# Install puppeteer so it's available in the container.
RUN yarn add puppeteer

# Add pptr user.
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /node_modules

# # Run user as non privileged.
# USER pptruser
#
# CMD ["google-chrome-unstable"]

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Only copy the package.json which specifies package dependencies. This is will
# ensure that packages are only re-installed if they are changed.
COPY package.json /usr/src/app/
RUN yarn install

# Copy the application source code and run the optional build step.
COPY . /usr/src/app

# Change the ownership of the application code and switch to the unprivileged
# user.
# RUN chown -R app:app /usr/src/app
# USER app

# Run the application directly, do not run via npm which heavily pollutes the
# environment variables and other stuff.
CMD [ "node", "index.js" ]