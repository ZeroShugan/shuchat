import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '../../components/page';
import CinnySVG from '../../../../public/res/svg/cinny.svg';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<img width="70" height="70" src={CinnySVG} alt="ShuChat Logo" />}
            title="Welcome to ShuChat"
            subTitle={
              <span>
                Your personal Matrix hub.{' '}
                <a
                  href="https://github.com/ZeroShugan/shuchat"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  v4.11.1
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href="https://github.com/ZeroShugan/shuchat"
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                <Box justifyContent="Center">
                  <Text as="span" size="T200">
                    Based on{' '}
                    <a
                      href="https://github.com/cinnyapp/cinny"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Cinny
                    </a>
                  </Text>
                </Box>
              </Box>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
