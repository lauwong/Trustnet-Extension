import generalUtils from '@/lib/generalUtils'
import insertedAppRouter from '@/router'
import store from '@/store'
import Fuse from 'fuse.js'
import consts from '@/lib/constants'

function getElementsContainingText(text) {

    console.log('text to look for is ',text)

    let xpath, query;
    let uncurlifiedText = generalUtils.uncurlify(text).toLowerCase();

    let results = [];

    try {
        xpath = `//*[(ancestor-or-self::h1 or ancestor-or-self::h2 or ancestor-or-self::h3 or 
        ancestor-or-self::h4 or ancestor-or-self::h5 or ancestor-or-self::h6 or ancestor-or-self::a)
         and ( contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
         "abcdefghijklmnopqrstuvwxyz"), 
         "${text}") or contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
         "abcdefghijklmnopqrstuvwxyz"), 
         "${uncurlifiedText}")
         )]`;
        query = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);    
    }
    catch (error) {
        console.log('error in xpath because the matching text has double quotes in it', error)
        if (error.name == 'DOMException') {
            xpath = `//*[(ancestor-or-self::h1 or ancestor-or-self::h2 or ancestor-or-self::h3 or 
            ancestor-or-self::h4 or ancestor-or-self::h5 or ancestor-or-self::h6 or ancestor-or-self::a)
            and ( contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "abcdefghijklmnopqrstuvwxyz"), 
            '${text}') or contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "abcdefghijklmnopqrstuvwxyz"), 
            '${uncurlifiedText}')
            )]`;
            query = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);  
        }
    }
        
    for (let i = 0, length = query.snapshotLength; i < length; ++i) {
        results.push(query.snapshotItem(i));
    }

    return results;
}

function addAltTitleNodeToHeadline(altTitle) {
    const newEl = document.createElement('em');
    newEl.classList.add('new-alt-headline', `title-${altTitle.id}`);
    newEl.addEventListener('click', function(ev) {
        ev.preventDefault();

        store.dispatch('titles/setDisplayedTitle', { 
            titleId: altTitle.id,
            titleText: altTitle.text
        });
        store.dispatch('titles/setTitlesDialogVisibility', true);
    
        insertedAppRouter.push({
            name: 'customTitles'
        });
        
    })

    newEl.appendChild(document.createTextNode(altTitle.sortedCustomTitles[0]['lastVersion'].text + ' '));
    return newEl;
}


function createEditButton () {
    const editButton = document.createElement('button');
    editButton.classList.add('rounded-edit-button');
    
    editButton.innerHTML = `
    <svg style="width:24px;height:24px;margin:0 auto" viewBox="0 0 24 24">
        <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
    </svg>
    `
    editButton.addEventListener('click', openCustomTitlesDialog)
    editButton.classList.add('headline-clickable');
    return editButton;
}

function acceptInputOnHeadline (headlineTag) {

    if (headlineTag.getAttribute('data-headline-id') === null) {

        headlineTag.setAttribute('data-headline-id', Math.random().toString(36).substring(2, 15));

        let color = window.getComputedStyle(headlineTag).color;

        let editButton = createEditButton();

        if (generalUtils.isTextLight(color)) {
            headlineTag.classList.add('title-background-dark');
            editButton.classList.add('title-background-dark')
        }   
        else {
            headlineTag.classList.add('title-background-light');
            editButton.classList.add('title-background-light');
        }

        headlineTag.appendChild(editButton)
    }
}

/*
Finds a text similar to a target text in two cases:
1. Looking for a title text returned by the server based on the hashes sent to it---
    searches within the innerText of the whole document
2. Looking for a title text in the document that matches the content of a meta title tag 
    (og:title, og:twitter) in which case it searches within the innerText of the whole document.
    Or determining whether the text content of a heading tag (passed as a searchSnippet) is
    similar enough to the content of the document's title tag
* @param {String} targetTitleText, Either a title text returned from the server or the text
of a title tag in the document
 * @param {Boolean} isSearchingForServerTitle, whether we're looking for a title that is returned
    from the server as a possible candidate title based on the hashes sent to the server, or
    whether we're looking for a text similar enough to a title tag. The cases are separated
    to allow for different score thresholds (currently set to be the same).
 * @param {String} searchSnippet (optional), the text of a heading tag
 * @return {String} The text that is similar enough to the title we're looking for if found,
    null if not found.
*/
function getFuzzyTextSimilarToHeading(targetTitleText, isSearchingForServerTitle, searchSnippet) {

    console.log('inside fuzzy search', targetTitleText, searchSnippet)

    /*
    By default this function searches the whole content of the document. To not look for the text
    in long paragraphs, we limit the search to only those leaf nodes with fewer than consts.MAX_TITLE_LENGTH
    characters. innerText is style aware and the advantage of using it is (e.g., compared to textContent)
    is that it does not return the content of the hidden elements. However, the text returned by it is
    affected by CSS styling (e.g., upper/lower case). Therefore, here, we convert the search term as well asarray containing
    leaf nodes' contents to lowercase
    */
    let textCorpus, scoreThreshold;
    if (!searchSnippet) { //looking within the entire body of the document to find a server returned title
        textCorpus = document.body.innerText.split('\n').filter(x => x.length <= consts.MAX_TITLE_LENGTH).map(el =>
            el.toLowerCase());
    }
    else { //looking within the title of a tag to see if it is similar enough with 
        textCorpus = [searchSnippet.toLowerCase()];
        scoreThreshold 
    }

    scoreThreshold = isSearchingForServerTitle ? consts.FINDING_TITLES_FUZZY_SCORE_THRESHOLD :
        consts.IDENTIFYING_TITLES_FUZZY_SCORE_THRESHOLD;

    const options = {
        includeScore: true,
        distance: 150
    }
   
    const fuse = new Fuse(textCorpus, options)
    let uncurlifiedText = generalUtils.uncurlify(targetTitleText);

    let texts = uncurlifiedText != targetTitleText ? [uncurlifiedText, targetTitleText] : [targetTitleText];
    texts = texts.map(el => el.toLowerCase());

    let finalResults = [], tempResults = [];
    for (let text of texts) {
        tempResults = fuse.search(text);
        if (!finalResults.includes(tempResults[0]))
            finalResults.push(tempResults[0]);
    }
    
    console.log('fuzzy search all results were', tempResults, scoreThreshold, finalResults[0])
    return (finalResults[0] && finalResults[0].score <= scoreThreshold) ? finalResults[0].item : null;
}

function findAndReplaceTitle(title, remove) {
    let results = getElementsContainingText(title.text);
    results = results.filter(el => !(['SCRIPT', 'TITLE'].includes(el.nodeName)));

    console.log('results of els', results)
    if (!results.length) {
        let similarText = getFuzzyTextSimilarToHeading(title.text, true);
        if (similarText)
            results = getElementsContainingText(similarText);
    }

    let nonScriptResultsCount = 0;

    store.dispatch('pageObserver/disconnectObserver');

    results.forEach(el => {
        if (el.nodeName != 'SCRIPT') {
            nonScriptResultsCount += 1;

            console.log('element found', el)

            //if headline has not been modified yet
            if (!el.classList.contains('headline-modified')) {

                const originalTitle = el.textContent;
                el.textContent = "";
                let newFirstChild = addAltTitleNodeToHeadline(title)

                const newSecondChild = document.createElement('del');
                newSecondChild.classList.add('headline-modified');
                newSecondChild.appendChild(document.createTextNode(originalTitle));

                el.appendChild(newFirstChild);
                el.appendChild(newSecondChild);
            }
            else {
                /*if headline has already been modified, the displayed alt headline either needs to change to another (in case of headline editing or removing),
                 or the alt headline should be removed altogether and the style of the original headline should be restored back to its original state 
                 (in case there is no alt headline left for the headline)
                 */
                let headlineContainer = el.parentNode;

                if (headlineContainer.children.length == 2) {
                    headlineContainer.removeChild(headlineContainer.children[0]);
                    if (remove == true) {
                        headlineContainer.appendChild(document.createTextNode(headlineContainer.children[0].textContent));
                        headlineContainer.removeChild(headlineContainer.children[0]);

                        acceptInputOnHeadline(headlineContainer)

                    }
                    else {
                        let newFirstChild = addAltTitleNodeToHeadline(title)
                        headlineContainer.insertBefore(newFirstChild, headlineContainer.children[0])
                    }
                    
                }
            }

        }
    })
    store.dispatch('pageObserver/reconnectObserver');

    return nonScriptResultsCount;
}


function htmlDecode(input) {
    let doc = new DOMParser().parseFromString(input, "text/html");
    return doc.documentElement.textContent;
}


function openCustomTitlesDialog(ev) {
    ev.preventDefault();
    let titleEl =  ev.target.closest('h1');

    store.dispatch('titles/setTitlesDialogVisibility', true);
    store.dispatch('titles/setDisplayedTitle', { 
        titleText: titleEl.textContent.trim(),
        titleElementId: titleEl.getAttribute('data-headline-id') 
    });

    insertedAppRouter.push({
        name: 'customTitles'
    });
}

function removeEventListenerFromTitle(headlineId) {
    let heading = document.querySelector(`[data-headline-id="${headlineId}"]`);
    heading.removeEventListener('click', openCustomTitlesDialog);
    heading.classList.remove('headline-clickable');
}

function identifyPotentialTitles() {
    let elResults = [];
    try {
        let ogTitle = htmlDecode(document.querySelector('meta[property="og:title"]').getAttribute('content'));
        console.log('og title is*******', ogTitle)

        if (ogTitle.length >= consts.MIN_TITLE_LENGTH) {
            elResults = getElementsContainingText(ogTitle).filter(el => !(['SCRIPT', 'TITLE'].includes(el.nodeName)));
        
            //if the exact ogTitle text was not found, look for text that is similar enough
            if (!elResults.length) {
                let similarText = getFuzzyTextSimilarToHeading(ogTitle, false);
                if (similarText.length >= consts.MIN_TITLE_LENGTH)
                    elResults = getElementsContainingText(similarText).filter(el => !(['SCRIPT', 'TITLE'].includes(el.nodeName)));
            }
    
            console.log('results of looking for og titles', elResults);
        }
       
    }
    catch(err) {
        console.log('in og:title, error is', err)
    }

    try {
        if (!elResults.length) {
            let twitterTitle = htmlDecode(document.querySelector('meta[name="twitter:title"]').getAttribute('content'));

            if (twitterTitle.length >= consts.MIN_TITLE_LENGTH) {
                elResults = getElementsContainingText(twitterTitle).filter(el => !(['SCRIPT', 'TITLE'].includes(el.nodeName)));
            
                //if the exact twitter title text was not found, look for text that is similar enough
                if (!elResults.length) {
                    let similarText = getFuzzyTextSimilarToHeading(twitterTitle, false);
                    if (similarText.length >= consts.MIN_TITLE_LENGTH)
                        elResults = getElementsContainingText(similarText).filter(el => !(['SCRIPT', 'TITLE'].includes(el.nodeName)));
                }
    
                console.log('results of looking for twitter titles', elResults);
            }
        
        }

    }
    catch(err) {
        console.log('in twitter:title, error is', err)
    }

    /*
    if og and twitter titles were not found on the page, look for h headings that have texts 
    similar to the document's title
    */
    if (!elResults.length) {

        let docTitle = document.querySelector('title').textContent;
        if (docTitle.length >= consts.MIN_TITLE_LENGTH) {
            let h1LevelHeadings = document.querySelectorAll('h1');
            let h2LevelHeadings = document.querySelectorAll('h2');
    
            elResults = [...h1LevelHeadings, ...h2LevelHeadings].filter(heading => {
                let similarText = getFuzzyTextSimilarToHeading(docTitle, false, heading.textContent);
                return similarText != null;
            }).filter(x => x.textContent.length >= consts.MIN_TITLE_LENGTH);
    
            console.log('headings from document title', elResults)
        }
      
    }

    elResults.forEach(heading => {
        if (!heading.classList.contains('headline-modified'))       
            acceptInputOnHeadline(heading);
    })

    store.dispatch('pageObserver/reconnectObserver');
}

export default {
    findAndReplaceTitle,
    identifyPotentialTitles,
    removeEventListenerFromTitle
}