const fs = require('fs/promises');
const util = require('util');
const axios = require('axios');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { token } = require('./config.json');

const { parse } = require('url');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const proxySourcesSocks5 = [
    'https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
    'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt',
    'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    'https://raw.githubusercontent.com/zebbern/Proxy-Scraper/main/socks5.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
];

const proxySourcesSocks4 = [
    'https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks4.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt',
    'https://raw.githubusercontent.com/zebbern/Proxy-Scraper/main/socks4.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
];

const proxySourcesHTTP = [
    'https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/free.txt',
    'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
];

const outputFileSocks5 = 'socks5.txt';
const outputFileSocks4 = 'socks4.txt';
const outputFileHTTP = 'http.txt';
const timeoutSeconds = 5000;
const maxJobs = 2;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.once('ready', () => {
    console.log('Discord bot is ready!');
});

client.on('messageCreate', async message => {
    if (message.content === '!socks5') {
        try {
            const attachment = new AttachmentBuilder(outputFileSocks5, { name: 'socks5.txt' });
            await message.channel.send({ files: [attachment] });
        } catch (error) {
            console.error('Error sending socks5 file:', error);
            message.reply('Could not send socks5 file. Please check if the file exists.');
        }
    } else if (message.content === '!socks4') {
        try {
            const attachment = new AttachmentBuilder(outputFileSocks4, { name: 'socks4.txt' });
            await message.channel.send({ files: [attachment] });
        } catch (error) {
            console.error('Error sending socks4 file:', error);
            message.reply('Could not send socks4 file. Please check if the file exists.');
        }
    } else if (message.content === '!http') {
        try {
            const attachment = new AttachmentBuilder(outputFileHTTP, { name: 'http.txt' });
            await message.channel.send({ files: [attachment] });
        } catch (error) {
            console.error('Error sending http file:', error);
            message.reply('Could not send http file. Please check if the file exists.');
        }
    }
});

async function fetchProxies(url) {
    try {
        const response = await axios.get(url);
        return response.data.split('\n').filter(proxy => proxy.trim() !== '');
    } catch (error) {
        console.error(`Failed to fetch proxies from ${url}: ${error}`);
        return [];
    }
}

async function checkProxy(proxyUrl, proxyType, outputFile) {
    const proxyAddress = `${proxyType}://${proxyUrl}`;
    const targetUrl = 'http://httpbin.org/ip';

    let agent;
    const parsed = parse(proxyAddress);
    if (proxyType === 'http' || proxyType === 'https')  {
        agent = proxyType === 'http'
            ? new HttpProxyAgent(proxyAddress)
            : new HttpsProxyAgent(proxyAddress);
    } else if (proxyType === 'socks4' || proxyType === 'socks5') {
        agent = new SocksProxyAgent(proxyAddress);
    }

    try {
        const response = await axios.get(targetUrl, {
            timeout: timeoutSeconds,
            httpAgent: agent,
            headers: {
                'User-Agent': 'ProxyChecker/1.0',
                'Accept': 'application/json',
            }
        });

        if (response.status === 200) {
            console.log('✅ Success: Proxy is working. Saving to file.');
            await fs.appendFile(outputFile, proxyUrl + '\n');
        } else {
            console.warn(`❌ Proxy returned HTTP ${response.status}`);
        }
    } catch (error) {
        if (error.code === 'ETIMEDOUT') {
            console.warn(`❌ Proxy timed out`);
        } else if (error.response?.status) {
            console.warn(`❌ Proxy returned HTTP ${error.response.status}`);
        } else {
            console.error(`❌ Proxy check failed: ${error.message}`);
        }
    }
    console.log('-----------------------------------');
}

async function processProxies(proxySources, proxyType, outputFile) {
    await fs.writeFile(outputFile, '');

    let allProxies = [];
    for (const source of proxySources) {
        const proxies = await fetchProxies(source);
        allProxies = allProxies.concat(proxies);
    }

    const uniqueProxies = [...new Set(allProxies)];
    console.log(`Fetched ${uniqueProxies.length} unique ${proxyType} proxies.`);

    let jobCount = 0;
    const runningJobs = [];

    for (const proxyUrl of uniqueProxies) {
        if (proxyUrl.trim() === '') continue;

        const job = checkProxy(proxyUrl, proxyType, outputFile);
        runningJobs.push(job);

        jobCount++;
        if (jobCount >= maxJobs) {
            await Promise.race(runningJobs);
            runningJobs.splice(runningJobs.indexOf(job), 1);
            jobCount--;
        }
    }

    await Promise.all(runningJobs);
    console.log(`${proxyType} proxy checks complete.`);
}

async function main() {
    async function runProxyChecks() {
        console.log('Starting proxy checks...');
        await processProxies(proxySourcesSocks5, 'socks5', outputFileSocks5);
        await processProxies(proxySourcesSocks4, 'socks4', outputFileSocks4);
        await processProxies(proxySourcesHTTP, 'http', outputFileHTTP);
        console.log('All proxy checks complete.');
    }

    await runProxyChecks();

    setInterval(runProxyChecks, 300000);

    client.login(token);
}

main();
