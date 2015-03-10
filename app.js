var defaultNames = ["Alice", "Bob", "C", "D", "Etupirka", "foo", "Google", "hoge", "I Am Legend", "3 Billion Devices", "K-means", "Louise", "Mac", "404", "Oops!", "printf", "qwerty", "README", "SAT", "Tautology", "USB", "--verbose", "Windows", "Xeon", "Yahoo", "/0"];
var glyphs;
var world;  // DEBUG ONLY

function isMobile()
{
    return ["Android", "iPhone", "iPad", "iPod"].some(function (discr) { return navigator.userAgent.indexOf(discr) >= 0; });
}

window.onload = function () {
    var submitButton = document.getElementById("submit");
    world = new World(function () {
        submitButton.value = "Let's Go!";
        submitButton.disabled = false;
    });
    var viewport = document.getElementById("viewport");
    var width = Math.floor(0.95 * Math.min(window.innerWidth, screen.width));
    var height = 500;
    var visual = new Visualizer(world, viewport, { width: width, height: height });
    var se = new SoundEffecter(world);

    var message = document.getElementById("message");
    message.textContent = "Enter your name:";

    var notification = document.getElementById("notification");
    notification.style.width = viewport.offsetWidth + "px";
    notification.style.height = viewport.offsetHeight + "px";
    notification.style.left = viewport.offsetLeft + "px";
    notification.style.top = viewport.offsetTop + "px";
    setTimeout(function () {
        notification.style.width = viewport.offsetWidth + "px";
        notification.style.height = viewport.offsetHeight + "px";
        notification.style.left = viewport.offsetLeft + "px";
        notification.style.top = viewport.offsetTop + "px";
    }, 11);
    
    var nameForm = document.getElementById("name");
    nameForm.placeholder = defaultNames[Math.floor(Math.random() * defaultNames.length)];
    nameForm.focus();

    function signup() {
        if (!glyphs) {
            THREE.FontUtils.face = Const.NameFont;
            glyphs = THREE.FontUtils.getFace().glyphs;
        }

        var name = nameForm.value ? nameForm.value : nameForm.placeholder;
        for (var i = 0; i < name.length; i++) {
            if (!(name[i] in glyphs)) {
                if (!window.confirm(" Your name contains some unrenderable characters. Will you continue?"))
                    return;
                break;
            }
        }
        world.Begin(name);

        window.focus();
        notification.style.display = "none";
        message.style.display = "none";
        notification.removeChild(nameForm);
        notification.removeChild(submitButton);

        if (isMobile())
            showButtons();
    }

    nameForm.onkeydown = function (e) { if (e.keyCode === 13) signup(); };
    submitButton.onclick = signup;

    var bs = null;
    var scoreboard = document.getElementById("scoreboard");

    function showButtons() {
        notification.style.display = "flex";
        notification.style.background = "none";
        bs = document.createElement("div");
        var button = [];
        bs.id = "control";
        ["◀", "●", "▶"].forEach(function (c) {
            var b = document.createElement("div");
            b.classList.add("button");
            b.textContent = c;
            b.addEventListener("touchstart", function () { world.control(c, "down"); b.style.backgroundColor = "#cccccc"; });
            b.addEventListener("touchmove", function (e) { e.preventDefault(); });
            b.addEventListener("touchend", function () { world.control(c, "up"); b.style.backgroundColor = "#ffffff"; });
            b.addEventListener("touchcancel", function () { world.control(c, "up"); });
            bs.appendChild(b);
        });
        notification.appendChild(bs);
    }
    function showScore() {
        if (bs)
            notification.removeChild(bs);
        notification.style.background = "#000000";
        message.textContent = "Scoreboard";
        message.style.display = "init";
        notification.style.display = "flex";
        scoreboard.style.display = "inherit";

        Util.makeTable(scoreboard,
            ["name", "dominoes"],
            [20, 2],
            world.ReadScoreboard());
    }

    world.AddEventHandler(WorldEvent.GameEnd, showScore);

    window.onunload = function () {
        world.End();
    };
};