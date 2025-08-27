chrome.runtime.onInstalled.addListener((info) => {
  if (info.reason === "install") {
    firstTimeSetup();
  }
});

function firstTimeSetup() {
  chrome.storage.local.get('redirects', function (data) {
    if (chrome.runtime.lastError) {
      console.error("Error accessing storage:", chrome.runtime.lastError);
    } else if (!data.redirects) {
      // Initialize storage only if it doesn't already exist
      chrome.storage.local.set({
        redirects: [
          {
            from: "https://redirect-example.com/something",
            to: "https://desired-url.com/something/more",
            enabled: false,
            method: 'GET',
            redirectRuleId: 1
          },
          {
            from: "https://redirect-to-local-server-example.com/something",
            to: "https://localhost:3000/something",
            enabled: false,
            method: 'POST',
            redirectRuleId: 2
          },
          {
            from: "https://redirect-multiple-apis-example.com/#",
            to: "http://localhost:3000/#",
            enabled: false,
            method: 'GET',
            redirectRuleId: 3
          },
          {
            from: "https://placeholder-params-example.com/project/#/tasks?Name=#&number=#",
            to: "https://localhost:3000/project/#/tasks?Name=#&number=#",
            enabled: false,
            method: 'DELETE',
            redirectRuleId: 4
          },
          {
            from: "https://placeholder-as-regex-example.com/#something/task",
            to: "http://localhost:3000/#something/task",
            enabled: false,
            method: 'GET',
            redirectRuleId: 5
          },
        ],
        onOff: ['OFF']
      }, function () {
        //console.log("Initial dummy redirect data stored.");
      });
    } else {
      //console.log("Redirect data already exist and initialized.");
    }
  });

  chrome.storage.local.set({ tempString: { from: "", to: "", method: "GET", edit: null }, lastUpdateDate: null }, function () {
    //console.log("Temporary storage initialized.");
  });

  // Get all current dynamic rules and remove them
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    const ruleIds = rules.map(rule => rule.id); // Collect all rule IDs

    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [], // No rules added initially
      removeRuleIds: ruleIds // Remove all currently applied dynamic rules
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing dynamic rules on install:", chrome.runtime.lastError);
      } else {
        //console.log("All dynamic rules removed on install.");
      }
    });
  });
}

// Listen to every request and store headers if it hits a specific domain
async function listenToRequestsAndStoreHeaders() {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    async function (details) {
      if (details.method.toLowerCase() !== 'get') return;
      let targetDomains = await getDomainArr();
      targetDomains = await getLatestDomains(targetDomains)
      setDomainArr(targetDomains);
      console.log("Target domains:", targetDomains, "Req :",  details)
      for (let targetDomain of targetDomains) {
        let upcomingDomain = (new URL(details.url)).hostname.toLowerCase();
        //console.log("Upcoming domain:", upcomingDomain, targetDomain)
        if ((upcomingDomain.includes(targetDomain))) {
          showWarningPopupLogic(details);
          const tokenHeaders = ['authorization', 'token', 'jwt', 'cookie', 'auth_token', 'session_id', 'Set-Cookie'];
          const authHedArr = details.requestHeaders.filter(o => tokenHeaders.some(keyword => (o.name.toLowerCase()).includes(keyword)))
          //console.log("upcoming headers : ", authHedArr)
          if (authHedArr.length < 1) {
            //console.log("No upcoming headers hence doing nothing ");
            return;
          }
          await chrome.storage.local.set({ [targetDomain]: authHedArr }, function () {
            //  console.log(`Headers for ${details.url} stored successfully`, authHedArr);
          });

          const rules = await getDomainModifyHeadersRule(targetDomain);
          //console.log("getDomainModifyHeadersRule: ", rules)
          for (let rule of rules) {
            rule.action.requestHeaders = authHedArr.map(header => ({
              header: header.name,
              value: header.value,
              operation: "set"
            }))
            await chrome.declarativeNetRequest.updateDynamicRules({
              addRules: [rule],
              removeRuleIds: [rule.id]
            }, () => {
              //console.log('Dynamic rule updated with new headers for', rule);
            });
          }
        }
      }
    },
    {
      urls: ['<all_urls>'],
      types: ['xmlhttprequest'] // Listen to only XMLHttpRequest (XHR) requests

    }, // Listen to all URLs

    ['requestHeaders'] // Include the request headers in the callback
  );

}

function displayExtensionMessage() {
  // Create a div for the message
  // Check if the message already exists
  if (document.getElementById('extension-warning-message')) {
    //console.log("Message already displayed on the page.");
    return; // Don't create another message
  }
  const messageDiv = document.createElement("div");
  messageDiv.id = 'extension-warning-message';
  messageDiv.style.position = "fixed";
  messageDiv.style.bottom = "2px";
  messageDiv.style.right = "10px";
  messageDiv.style.padding = "10px 15px";
  messageDiv.style.backgroundColor = "rgba(0, 123, 255, 0.9)";//"#4394eb";
  messageDiv.style.color = "white";
  messageDiv.style.fontSize = "14px";
  messageDiv.style.borderRadius = "5px";
  messageDiv.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  messageDiv.style.zIndex = "10000";
  messageDiv.textContent = "Redirect to Local Server: Listening to APIs...❤️";


  // Append the message to the page
  document.body.appendChild(messageDiv);

  // Remove the message after 3 seconds
  setTimeout(() => {
    messageDiv.remove();
  }, 2000);
}

async function showWarningPopupLogic(details){
  const isEnabled = await getAppOnOffState();
  if (isEnabled == 'ON') {
    if (details.tabId && details.tabId >= 0) {
      //console.log("Request associated with a valid tab.");
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: displayExtensionMessage,
      });
    } else {
    }
  }
}

async function getDomainArr(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["allDomines"], (result) => {
      resolve(result.allDomines || []);
    });
  });
}

async function getAppOnOffState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["onOff"], (result) => {
      resolve(result.onOff[0] || 'OFF');
    });
  });
}

async function setDomainArr(updatedDomains) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ allDomines: updatedDomains }, () => {
      //console.log("Domains updated successfully:", updatedDomains);
      resolve(updatedDomains);
    });
  });
}


async function getDomainModifyHeadersRule(targetDomain) {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((allRules) => {
      //console.log("getDomainModifyHeadersRule allrules:", allRules);
      const mainruleId = allRules
        .filter(r => (r.condition.regexFilter.replace(/\\/g, '')).includes(targetDomain))
        .map(o => +o.id + 1);
      //console.log("getDomainModifyHeadersRule domain rules:", mainruleId);
      const domainRule = allRules.filter(o =>
        o?.action?.type === "modifyHeaders" && mainruleId.includes(o?.id)
      );
      //console.log("getDomainModifyHeadersRule domain header rules:", domainRule);
      resolve(domainRule);
    });
  });
}

async function getLatestDomains(targetDomains) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["redirects"], function (data) {
      //console.log("All rules:", allRules);
      let allRules = data.redirects || [];
      // Filter domains that are present in the dynamic rules
      const validDomains = targetDomains.filter((domain) => {
        return allRules.some((rule) => {
          return rule.from?.toLowerCase().includes(domain.toLowerCase());
        });
      });
      //console.log("getLatestDomains domains:", validDomains);
      resolve(validDomains);
    });
  });
}


listenToRequestsAndStoreHeaders();

chrome.action.onClicked.addListener((tab) => {
  const extensionId = chrome.runtime.id;
  const baseUrl = "https://codytools.com/redirect-to-local-server/?extension_id=";
  //const baseUrl = "http://localhost:8800/index.html?extension_id=";
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((t) => {
      if (t.url && t.url.startsWith(baseUrl)) {
        chrome.tabs.remove(t.id);
      }
    });
    chrome.tabs.create({
      url: `${baseUrl}${extensionId}`,
      index: tab.index + 1
    });
  });
});


chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => 
{
  if (request.action === 'GetAllData') {
    chrome.storage.local.get(['redirects', 'onOff'], (result) => {
      let redirects = result.redirects || [];
      if(request.search){
        redirects = redirects.filter(r=> r.from?.toLowerCase().includes(request?.search.toLowerCase()) || r.to?.toLowerCase().includes(request.search.toLowerCase()))
      }
      const onOff = result.onOff || [];
      sendResponse({ redirects, onOff });
    });
  }
  else if (request.action === 'AddRedirect') {
    console.log("triggered addRedirect");
    AddUpdateRedirect(request.fromUrl, request.toUrl, request.method, request.ruleId)
    sendResponse({});
    console.log("complete addRedirect");
  }
  else if (request.action === 'EditRedirect') {
    console.log("triggered EditRedirect");
    AddUpdateRedirect(request.fromUrl, request.toUrl, request.method, request.ruleId)
    sendResponse({});
    console.log("complete EditRedirect");
  }
  else if (request.action === 'DeleteRedirect') {
    console.log("triggered DeleteRedirect");
    DeleteRedirect(request.ruleId)
    sendResponse({});
    console.log("complete DeleteRedirect");
  }
  else if (request.action === 'EnableDisableRedirect') {
    console.log("triggered EnableDisableRedirect");
    EnableDisableRedirect(request.ruleId, request.status)
    sendResponse({});
    console.log("complete EnableDisableRedirect");

  }
  else if (request.action === 'EnableDisableExtension') {
    console.log("triggered EnableDisableExtension");
    triggerMainToggleButton(request.status)
    sendResponse({});
    console.log("complete EnableDisableExtension");
  }
  else if (request.action === 'ReSyncRedirects') {
    console.log("triggered ReSyncRedirects");
    reSyncRedirects()
    sendResponse({});
    console.log("complete ReSyncRedirects");
  }
});

function EnableDisableRedirect(ruleId, status) {
  chrome.storage.local.get(["redirects", "onOff"], function (data) {
    const redirects = data.redirects || [];
    const onOff = data.onOff ? data.onOff[0] : 'OFF';
    const index = redirects.findIndex(r => r.redirectRuleId == ruleId);
    redirects[index].enabled = status;
    chrome.storage.local.set({ redirects: redirects }, async function () { });
    //add or delete  redirect rules 
    const redirect = redirects[index];
    if (status && onOff == 'ON') {
      updateRedirectRule({ fromUrl: redirect.from, toUrl: redirect.to, id: redirect.redirectRuleId, method: redirect.method });
    }
    else {
      removeRedirectRule(redirect.redirectRuleId);
    }
  });
}

function removeRedirectRule(ruleId) {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [+ruleId, +ruleId + 1]
  }, () => {
    if (chrome.runtime.lastError) {
      console.log("Error removing dynamic rule:", chrome.runtime.lastError);
    } else {
      console.log(`Redirect rule with id ${ruleId} removed from dynamic rules.`);
    }
  });
}

function DeleteRedirect(ruleId) {
  chrome.storage.local.get(["redirects"], function (data) {
    let redirects = data.redirects || [];
    redirects = redirects.filter(r => r.redirectRuleId != ruleId);
    // Save the updated lists to storage
    chrome.storage.local.set({ redirects: redirects }, function () { });
    //delete from rules 
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [+ruleId, +ruleId + 1]
    }, () => { });
  });
}

async function reSyncRedirects() {

  ['ON', 'OFF', 'ON', 'OFF'].forEach(async (btn) => {
    await chrome.storage.local.get(['redirects', 'onOff'], async (result) => {
      let redirects = result.redirects || [];
      let onOff = result.onOff || ['OFF']
      redirects.forEach(r => r.enabled = btn !== 'Enable All' ? false : true);
      await chrome.storage.local.set(
        {
          redirects: redirects,
          onOff: onOff
        });
      updateRulesBasedOnOnOFF(btn !== 'Enable All' || onOff[0] == 'OFF' ? 'OFF' : 'ON')
    })
  }
  )
}

async function updateRulesBasedOnOnOFF(state, source) {
  try {
    if (state === 'OFF') {
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        const ruleIds = rules.map(rule => rule.id);
        chrome.declarativeNetRequest.updateDynamicRules(
          {
            addRules: [],
            removeRuleIds: ruleIds
          }, () => {
            if (chrome.runtime.lastError) {
              console.error(`Error removing rules: ${chrome.runtime.lastError.message}`);
            } else {
              console.log('All dynamic rules removed successfully.');
            }
          });
      });
    }
    else if (state === 'ON') {
      await chrome.storage.local.get(["redirects"], async function (data) {
        let redirects = data.redirects || [];
        redirects = redirects.filter(r => r.enabled === true);
        for (let redirect of redirects) {
          await updateRedirectRule({ fromUrl: redirect.from, toUrl: redirect.to, id: redirect.redirectRuleId, method: redirect.method });
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function triggerMainToggleButton(status) {
  chrome.storage.local.get('redirects', async (result) => {
    const currentRedirects = result.redirects || [];
    const switchTextValue = status || 'OFF';
    chrome.storage.local.set(
      {
        redirects: currentRedirects,
        onOff: [switchTextValue]
      });
      updateRulesBasedOnOnOFF(status);
  })
}

async function AddUpdateRedirect(fromUrl, toUrl, method, ruleId) {

  // Get current redirects and methods from storage
  chrome.storage.local.get(["redirects", "onOff"], function (data) {
    let redirects = data.redirects || [];
    let onOff = data.onOff ? data.onOff[0] : "OFF";

    const operationType = ruleId ? 'UPDATE' : 'CREATE';
    const currentTimestamp = new Date().toISOString();

    if (operationType == 'UPDATE') {
      const updatedRedirect = {
        from: fromUrl,
        to: toUrl,
        enabled: true,
        method: method,
        redirectRuleId: ruleId,
        timestamp: currentTimestamp
      };
      //make it on top
      redirects = redirects.filter(r => r.redirectRuleId != ruleId);
      redirects.unshift(updatedRedirect);
      chrome.storage.local.set({ redirects: redirects, onOff: [onOff] });
      console.log("Redirect updated successfully")
    }
    // Add new redirect to the top
    else if (operationType == 'CREATE') {
      ruleId = redirects.length ? Math.max(...redirects.map(e => e.redirectRuleId)) + 2 : 1
      redirects.unshift({
        from: fromUrl,
        to: toUrl,
        enabled: true,
        method: method,
        redirectRuleId: ruleId,
        timestamp: currentTimestamp
      });
      chrome.storage.local.set({ redirects: redirects, onOff: [onOff] });
      console.log("Redirect added successfully");
    }

    if (onOff == 'ON') {
      updateRedirectRule({ fromUrl, toUrl, id: ruleId, method })
    }

    let domainName = new URL(fromUrl);
    domainName = domainName.hostname.toLowerCase();
    setDomainArr2(domainName);
  });
}


async function updateRedirectRule({ fromUrl, toUrl, id, method }) {
  const ruleId = parseInt(id, 10); // Parse the id as an integer
  let domainName = new URL(fromUrl);
  domainName = domainName.hostname.toLowerCase();
  const specialChars = /[.*+?^${}()/|[\]\\]/g;
  fromUrl = fromUrl.replace(specialChars, '\\$&')
  fromUrl = fromUrl.replace(/#+/g, '(.*)');
  fromUrl = '^' + fromUrl + '$';

  let headerRedirectUrl = toUrl;
  headerRedirectUrl = headerRedirectUrl.replace(specialChars, '\\$&')
  headerRedirectUrl = headerRedirectUrl.replace(/#+/g, '(.*)');
  headerRedirectUrl = '^' + headerRedirectUrl + '$';


  let count = 1;
  toUrl = toUrl.replace(/#+/g, '#');
  toUrl = toUrl.replace(/#/g, () => `\\${count++}`);

  // Create the new redirect rule
  const redirectRule = {
    id: ruleId,
    priority: ruleId,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: toUrl
      }
    },
    condition: {
      regexFilter: fromUrl,
      requestMethods: [method.toLowerCase()], // Check for the specified method (e.g., POST)
      resourceTypes: ["xmlhttprequest"] // Main frame request, can be changed as needed
    }
  };

  //get the token for domine from storage
  const heders = await getToken(domainName);

  // Create the new modify headers rule
  const modifyHeadersRule = {
    id: ruleId + 1, // Use a unique ID different from the redirect rule
    priority: ruleId + 1, // Set priority higher than the redirect rule
    action: {
      type: "modifyHeaders",
      requestHeaders: heders.map(header => ({
        header: header.name,
        value: header.value,
        operation: "set"
      }))
    },
    condition: {
      regexFilter: headerRedirectUrl, // Matches the redirected URL pattern
      requestMethods: [method.toLowerCase()], // Check for the specified method (e.g., POST)
      resourceTypes: ["xmlhttprequest"] // Target API requests
    }
  };

  // Update the dynamic rules in your background script
  chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [redirectRule, modifyHeadersRule], // Add the new rule
    removeRuleIds: [ruleId, ruleId + 1] // Remove old rules if any, using the integer ID
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error while updating rules:", chrome.runtime.lastError);
    } else {
      console.log("Redirect rules updated successfully.");
    }
  });
}

async function getToken(domainName) {
  return new Promise((resolve) => {
    chrome.storage.local.get([domainName], (result) => {
      console.log('get Headers:', result[domainName]);
      resolve(
        result[domainName] || [
          {
            name: "Authorization",
            value: ""
          }
        ]
      );
    });
  });
}


async function setDomainArr2(domain) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["allDomines"], function (result) {
      let existingDomains = result.allDomines || [];
      if (existingDomains.includes(domain)) return;
      existingDomains.push(domain);
      chrome.storage.local.set({ "allDomines": existingDomains }, function () {
        console.log("Updated domains:", existingDomains);
        resolve(existingDomains);
      });
    });
  });
}