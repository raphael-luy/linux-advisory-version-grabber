// ==UserScript==
// @name         Version Grabber
// @namespace    http://tampermonkey.net/
// @version      2024-05-09
// @description  Grab Intro and Fixed versions for FT
// @author       Raphael
// @match        https://lore.kernel.org/linux-cve-announce/*/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kernel.org
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /*
     =======
      Flags
     =======
    */

    let INCLUDE_SAME_VERSION = true

    /*
     =======
      Regex
     =======
    */

    let version_regex = /(?<Major>\d*).(?<Minor>\d*)(\.(?<Patch>\d*)|-rc(?<RC>\d*))*/
    let intro_regex = /Issue introduced in (?<Intro>\S*) with commit \S{12}/i
    let fixed_regex = /fixed in (?<Fixed>\S*) with commit \S{12}/i

    /*
     =====================================
      Grab the versions from the advisory
     =====================================
    */

    let version_pairs = []
    let versions = document.getElementById("b").textContent.match(/Issue introduced in (\S*) with commit \S{12} and fixed in (\S*) with commit \S{12}|fixed in (\S*) with commit \S{12}|Issue introduced in (\S*) with commit \S{12}/gi);
    for (var i = 0; i < versions.length; i++) {
        let intro_version = intro_regex.exec(versions[i])
        let fixed_version = fixed_regex.exec(versions[i])

        if (intro_version == null) {
            intro_version = "0.0.0"
        } else {
            intro_version = intro_version.groups.Intro
        }
        if (fixed_version == null) {
            fixed_version = fixed_regex.exec(versions[i])
            if (fixed_version == null) {
                fixed_version = "0.0.0"
            } else {
                fixed_version = fixed_version.groups.FixedOnly
            }
        } else {
            fixed_version = fixed_version.groups.Fixed
        }
        let version = { intro_version, fixed_version }

        version_pairs.push(version)
    }

    // Sort by fixed version
    version_pairs.sort((a, b) => version_compare(a.fixed_version, b.fixed_version))


    let last_fixed
    let final_versions = []

    for (var j = 0; j < version_pairs.length; j++) {
        if(last_fixed != null) {
            let current_intro = version_pairs[j].intro_version
            let current_fixed = version_pairs[j].fixed_version
            if(version_compare(current_intro, last_fixed) == -1) {
                // Intro is less than the last fixed version: change the intro to the next version after fix
                let intro_version = skip_to_next_release(last_fixed, current_fixed)
                let fixed_version = current_fixed
                let version = { intro_version, fixed_version }
                if(INCLUDE_SAME_VERSION || version_compare(intro_version, fixed_version) != 0) {
                    final_versions.push(version)
                }
            } else {
                // Intro is greater than the last fixed version: no conflict
                final_versions.push(version_pairs[j])
            }
        } else {
            final_versions.push(version_pairs[j])
        }
        last_fixed = version_pairs[j].fixed_version
    }

    console.log(version_to_text(final_versions))

    /*
     ==============================
      Add Copy to Clipboard Button
     ==============================
    */

    var copyToClipboadBtn = document.createElement ('div');
    copyToClipboadBtn.innerHTML = '<button id="copy" type="button">'
        + 'Copy version info</button>'
    ;
    copyToClipboadBtn.setAttribute ('id', 'myContainer');
    document.getElementById("b").prepend(copyToClipboadBtn);

    document.getElementById("copy").addEventListener (
        "click", ButtonClickAction, false
    );

    function ButtonClickAction (zEvent) {
        navigator.clipboard.writeText(version_to_text(final_versions))
    }

    /*
     ===================
      Utility Functions
     ===================
    */

    function version_to_text(versions) {
        let version_info = ""
        for (var i = 0; i < versions.length; i++) {
            if(versions[i].intro_version == "0.0.0") {
                version_info += "( , "
            } else {
                version_info += "[" + versions[i].intro_version + ", "
            }
            if(versions[i].fixed_version == "0.0.0") {
                version_info += ")"
            } else {
                version_info += versions[i].fixed_version + ")"
            }
        }
        return version_info
    }

    function skip_to_next_release(prev_fixed, current_fixed) {
        var prev_fixed_temp = version_regex.exec(prev_fixed)
        var prev_fixed_major = parseInt(prev_fixed_temp.groups.Major),
            prev_fixed_minor = parseInt(prev_fixed_temp.groups.Minor),
            prev_fixed_patch = parseInt(prev_fixed_temp.groups.Patch),
            prev_fixed_rc = parseInt(prev_fixed_temp.groups.RC)
        var current_fixed_temp = version_regex.exec(current_fixed)
        var current_fixed_major = parseInt(current_fixed_temp.groups.Major),
            current_fixed_minor = parseInt(current_fixed_temp.groups.Minor),
            current_fixed_patch = parseInt(current_fixed_temp.groups.Patch),
            current_fixed_rc = parseInt(current_fixed_temp.groups.RC)

        if (prev_fixed_major < current_fixed_major) { // [4.10, 5.15.153) [4.10, 6.1.83) = [6.0.0, 6.1.83)
            return (prev_fixed_major + 1) + ".0.0"
        } else if (prev_fixed_minor < current_fixed_minor) { // [4.10, 5,10.214) [4.10, 5.15.153) = [5.11.0, 5.15.153)
            if(isNaN(current_fixed_rc)) {
                return prev_fixed_major + "." + (prev_fixed_minor + 1) + ".0"
            } else if (isNaN(prev_fixed_rc)) {
                return prev_fixed_major + "." + (prev_fixed_minor + 1) + "-rc1"
            }
        } else if (prev_fixed_patch < current_fixed_patch) {
            return prev_fixed_major + "." + prev_fixed_minor + "." + (prev_fixed_patch + 1)
        } else if (prev_fixed_rc < current_fixed_rc) {
            return prev_fixed_major + "." + prev_fixed_minor + "-rc" + (prev_fixed_rc + 1)
        }

        return 0;
    }

    function version_compare(a, b){
        // Min return
        var a_temp = version_regex.exec(a)
        var a_major = parseInt(a_temp.groups.Major),
            a_minor = parseInt(a_temp.groups.Minor),
            a_patch = parseInt(a_temp.groups.Patch),
            a_rc = parseInt(a_temp.groups.RC)

        var b_temp = version_regex.exec(b)
        var b_major = parseInt(b_temp.groups.Major),
            b_minor = parseInt(b_temp.groups.Minor),
            b_patch = parseInt(b_temp.groups.Patch),
            b_rc = parseInt(b_temp.groups.RC)

        if(a_major != null && b_major != null) {
            if(a_major < b_major) {
                return -1
            } else if(a_major > b_major) {
                return 1
            }
        }

        if(a_minor != null && b_minor != null) {
            if(a_minor < b_minor) {
                return -1
            } else if(a_minor > b_minor) {
                return 1
            }
        }

        if(a_patch != null && b_patch != null) {
            if(a_patch < b_patch) {
                return -1
            } else if(a_patch > b_patch) {
                return 1
            }
        }

        if(a_rc != null && b_rc != null) {
            if(a_rc < b_rc) {
                return -1
            } else if(a_rc > b_rc) {
                return 1
            }
        }

        if(!isNaN(a_rc) && !isNaN(b_patch)) { //x.x-rcx, x.x.x
            return -1
        } else if (!isNaN(a_patch) && !isNaN(b_rc)) { //x.x.x, x.x-rcx
            return 1
        } else if (isNaN(a_patch) && b_patch >= 0) {
            return -1
        } else if (a_patch >= 0 && !isNaN(b_patch)) { //x.x.0, x.x
            return 1
        }

        return 0
    }

}


)();